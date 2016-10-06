const Boom = require('boom')
const server = require('../').hapi
const config = require('../../config')
const log = require('../helpers/logger')
const async = require('async')
const Hoek = require('hoek')
const _ = require('underscore')
const facebook = require('../helpers/facebook')
const Token = require('../auth/token')
const Fenix = require('fenixedu')(config.fenix)
const google = require('../helpers/google')

server.method('auth.facebook', facebookAuth, {})
server.method('auth.fenix', fenixAuth, {})
server.method('auth.google', googleAuth, {})
server.method('auth.addFacebook', addFacebookAuth, {})
server.method('auth.addGoogle', addGoogleAuth, {})
server.method('auth.addFenix', addFenixAuth, {})
server.method('auth.refreshToken', refreshToken, {})

// //////////////////////////
// Facebook helper functions
// //////////////////////////

function debugFBToken (id, token, cb) {
  facebook.debugToken(id, token, (err, isValid) => {
    if (err) {
      return cb(Boom.unauthorized(err))
    }

    if (!isValid) {
      return cb(Boom.unauthorized('nice try'))
    }

    cb()
  })
}

function getFBUser (id, token, cb) {
  server.methods.user.get({'facebook.id': id}, (err, user) => {
    if (err) {
      if (!err.output || err.output.statusCode !== 404) {
        log.error({err: err, facebook: id}, '[facebook-login] error getting user')
        return cb(err)
      }

      return fbUserNotFound(token, cb)
    }

    fbUserFound(user, token, cb)
  })
}

function addFBaccount (user, fbUser, token, cb) {
  server.methods.user.get({'facebook.id': fbUser.id}, (err, _user) => {
    if (err) {
      if (!err.output || err.output.statusCode !== 404) {
        log.error({err: err, facebook: fbUser.id}, '[facebook-login] error getting user')
        return cb(err)
      }

      const changedAttributes = {
        facebook: {
          id: fbUser.id,
          token: token
        }
      }

      changedAttributes.mail = user.mail || fbUser.email

      return updateUserAuth({id: user.id}, changedAttributes, cb)
    }

    if (_user.id === user.id) {
      log.error({user: user.id}, '[google-login] user already added account')
      return cb(Boom.conflict('Account alaready registered to this user'))
    }

    // force new auth on merge
    user.facebook = _user.facebook
    user.facebook.token = token
    mergeAccount(user, _user, cb)
  })
}

function fbUserFound (user, token, cb) {
  if (user.mail) {
    return authenticate(user.id, {'facebook.token': token}, cb)
  }

  facebook.getMe(token, (err, facebookUser) => {
    if (err) {
      log.error({err: err, id: facebookUser.id, token: token}, '[facebook-login] error retrieving user info from facebook')
      return cb(Boom.unauthorized('couldn\'t retrieve your info from facebook'))
    }

    if (!facebookUser.email) {
      log.error({err: err, id: facebookUser.id, token: token}, '[facebook-login] user logged in without valid facebook e-mail')
      return cb(Boom.notAcceptable('you must have a valid facebook e-mail'))
    }

    log.debug({facebookUser: facebookUser.id}, '[facebook-login] got facebook user')

    server.methods.user.get({mail: facebookUser.email}, (err, _user) => {
      if (err) {
        if (!err.output || err.output.statusCode !== 404) {
          log.error({err: err, mail: facebookUser.email, token: token}, '[facebook-login] error retrieving user info from facebook')
          return cb(Boom.unauthorized('couldn\'t retrieve your info from facebook'))
        }
        return authenticate(user.id, {mail: facebookUser.email, 'facebook.token': token}, cb)
      }

      if (user.facebook) {
        user.facebook.token = token
      }
      mergeAccount(user, _user, cb)
    })
  })
}

function fbUserNotFound (token, cb) {
  let changedAttributes = {}
  let filter = {}

  facebook.getMe(token, (err, facebookUser) => {
    if (err) {
      log.error({err: err, id: facebookUser.id, token: token}, '[facebook-login] error retrieving user info from facebook')
      return cb(Boom.unauthorized('couldn\'t retrieve your info from facebook'))
    }

    if (!facebookUser.email) {
      log.error({err: err, id: facebookUser.id, token: token}, '[facebook-login] user logged in without valid facebook e-mail')
      return cb(Boom.notAcceptable('you must have a valid facebook e-mail'))
    }

    log.debug({facebookUser: facebookUser.id}, '[facebook-login] got facebook user')

    filter = { mail: facebookUser.email }

    changedAttributes = {
      facebook: {
        id: facebookUser.id,
        token: token
      }
    }

    // If user does not exist, lets set the id, name and email
    changedAttributes.$setOnInsert = {
      id: Math.random().toString(36).substr(2, 20), // generate random id
      name: facebookUser.name,
      mail: facebookUser.email
    }

    server.methods.user.update(filter, changedAttributes, {upsert: true}, (err, result) => {
      if (err) {
        log.error({user: {mail: facebookUser.email}, changedAttributes: changedAttributes}, '[facebook-login] error upserting user')
        return cb(err)
      }

      log.debug({id: result.id}, '[facebook-login] upserted user')

      return authenticate(result.id, null, cb)
    })
  })
}

// //////////////////////////
// Google helper functions
// //////////////////////////

function debugGToken (id, token, cb) {
  google.debugToken(id, token, (err, isValid) => {
    if (err) {
      return cb(Boom.unauthorized(err))
    }

    if (!isValid) {
      return cb(Boom.unauthorized('nice try'))
    }
    cb()
  })
}

function getGUser (id, token, cb) {
  server.methods.user.get({'google.id': id}, (err, user) => {
    if (err) {
      if (!err.output || err.output.statusCode !== 404) {
        log.error({err: err, google: id}, '[google-login] error getting user')
        return cb(err)
      }

      return gUserNotFound(id, token, cb)
    }

    gUserFound(user, id, token, cb)
  })
}

function addGaccount (user, gUser, mail, token, cb) {
  server.methods.user.get({'google.id': gUser.id}, (err, _user) => {
    if (err) {
      if (!err.output || err.output.statusCode !== 404) {
        log.error({err: err, google: gUser.id}, '[google-login] error getting user')
        return cb(err)
      }

      const changedAttributes = {
        google: {
          id: gUser.id,
          img: gUser.image.url + '0',
          token: token
        }
      }

      changedAttributes.mail = user.mail || mail

      return updateUserAuth({id: user.id}, changedAttributes, cb)
    }

    if (_user.id === user.id) {
      log.error({user: user.id}, '[google-login] user already added account')
      return cb(Boom.conflict('Account alaready registered to this user'))
    }

    // force new auth on merge
    user.google = _user.google
    user.google.token = token
    mergeAccount(user, _user, cb)
  })
}

function gUserFound (user, id, token, cb) {
  if (user.mail) {
    return authenticate(user.id, {'google.token': token}, cb)
  }

  google.getMe(id, (err, googleUser) => {
    if (err) {
      log.error({err: err, id: id, token: token}, '[google-login] error retrieving user info from google')
      return cb(Boom.unauthorized('couldn\'t retrieve your info from google'))
    }

    google.getMail(token, (err, mail) => {
      if (err) {
        log.error({err: err, id: id, token: token}, '[google-login] error retrieving user email from google')
        return cb(Boom.unauthorized('couldn\'t retrieve your info from google'))
      }

      if (!mail) {
        log.error({err: err, id: id, token: token}, '[google-login] user logged in without valid google e-mail')
        return cb(Boom.notAcceptable('you must have a valid google e-mail'))
      }

      server.methods.user.get({mail: mail}, (err, _user) => {
        if (err) {
          if (!err.output || err.output.statusCode !== 404) {
            log.error({err: err, mail: mail, token: token}, '[google-login] error retrieving user info from google')
            return cb(Boom.unauthorized('couldn\'t retrieve your info from google'))
          }
          return authenticate(user.id, {mail: mail, 'google.token': token}, cb)
        }

        if (user.google) {
          user.google.token = token
        }
        mergeAccount(user, _user, cb)
      })
    })
  })
}

function gUserNotFound (id, token, cb) {
  let changedAttributes = {}
  let filter = {}

  google.getMe(id, (err, googleUser) => {
    if (err) {
      log.error({err: err, id: id, token: token}, '[google-login] error retrieving user info from google')
      return cb(Boom.unauthorized('couldn\'t retrieve your info from google'))
    }

    google.getMail(token, (err, mail) => {
      if (err) {
        log.error({err: err, id: id, token: token}, '[google-login] error retrieving user email from google')
        return cb(Boom.unauthorized('couldn\'t retrieve your info from google'))
      }

      if (!mail) {
        log.error({err: err, id: id, token: token}, '[google-login] user logged in without valid google e-mail')
        return cb(Boom.notAcceptable('you must have a valid google e-mail'))
      }

      filter = { mail: mail }

      changedAttributes = {
        google: {
          id: googleUser.id,
          img: googleUser.image.url + '0',
          token: token
        }
      }

      // If user does not exist, lets set the id, name and email
      changedAttributes.$setOnInsert = {
        id: Math.random().toString(36).substr(2, 20), // generate random id
        name: googleUser.displayName,
        mail: mail
      }

      server.methods.user.update(filter, changedAttributes, {upsert: true}, (err, result) => {
        if (err) {
          log.error({user: {mail: mail}, changedAttributes: changedAttributes}, '[google-login] error upserting user')
          return cb(err)
        }

        log.debug({id: result.id}, '[google-login] upserted user')

        return authenticate(result.id, null, cb)
      })
    })
  })
}

// //////////////////////////
// Fenix helper functions
// //////////////////////////

function getFenixToken (code, cb) {
  Fenix.auth.getAccessToken(code, (err, response, body) => {
    let auth

    if (err || !body) {
      log.error({err: err, response: response.statusCode, body: body}, '[fenix-login] error getting access token')
      return cb(Boom.unauthorized(body))
    }

    auth = {
      token: body.access_token, // jshint ignore:line
      refreshToken: body.refresh_token, // jshint ignore:line
      ttl: body.expires_in, // jshint ignore:line
      created: Date.now()
    }

    cb(null, auth)
  })
}

function getFenixInfo (auth, cb) {
  Fenix.person.getPerson(auth.token, (err, fenixUser) => {
    let user
    const _auth = auth

    if (err || !fenixUser) {
      log.error({err: err, user: fenixUser}, '[fenix-login] error getting person')
      return cb(Boom.unauthorized())
    }

    _auth.id = fenixUser.username
    user = {
      auth: _auth,
      name: fenixUser.name,
      email: {
        main: fenixUser.email,
        others: fenixUser.personalEmails.concat(fenixUser.workEmails)
      }
    }
    cb(null, user)
  })
}

function getFenixUser (fenixUser, cb) {
  server.methods.user.get({'fenix.id': fenixUser.auth.id}, (err, user) => {
    if (err) {
      if (!err.output || err.output.statusCode !== 404) {
        log.error({err: err, fenix: fenixUser.auth.id}, '[fenix-login] error getting user')
        return cb(err)
      }

      return fenixUserNotFound(fenixUser, cb)
    }
    const changedAttributes = {fenix: fenixUser.auth}
    changedAttributes.mail = user.mail || fenixUser.email.main
    authenticate(user.id, changedAttributes, cb)
  })
}

function addFenixAccount (user, fenixUser, cb) {
  server.methods.user.get({'fenix.id': fenixUser.auth.id}, (err, _user) => {
    const changedAttributes = {}

    if (err) {
      if (!err.output || err.output.statusCode !== 404) {
        log.error({err: err, fenix: fenixUser.auth.id}, '[fenix-login] error getting user')
        return cb(err)
      }

      changedAttributes.fenix = fenixUser.auth

      changedAttributes.mail = user.mail || fenixUser.email.main

      log.debug({fenixUser: fenixUser.id}, '[fenix-login] got fenix user')

      return updateUserAuth({id: user.id}, changedAttributes, cb)
    }

    if (_user.id === user.id) {
      log.error({user: user.id}, '[fenix-login] user already added account')
      return cb(Boom.conflict('Account alaready registered to this user'))
    }

    user.fenix = Hoek.applyToDefaults(_user.fenix, fenixUser.auth)
    mergeAccount(user, _user, cb)
  })
}

function fenixUserNotFound (fenixUser, cb) {
  const changedAttributes = {}
  const filter = {}

  changedAttributes.fenix = fenixUser.auth

  // If user does not exist, lets set the id, name and email
  changedAttributes.$setOnInsert = {
    id: Math.random().toString(36).substr(2, 20), // generate random id
    name: fenixUser.name,
    mail: fenixUser.email.main
  }

  fenixUser.email.others.push(fenixUser.email.main)

  filter.mail = {$in: fenixUser.email.others}

  log.debug({fenixUser: fenixUser.id}, '[fenix-login] got fenix user')

  // Update the fenix details of the user with any this emails, ou create a new user if it does not exist
  server.methods.user.update(filter, changedAttributes, {upsert: true}, (err, result) => {
    if (err) {
      log.error({query: filter, changedAttributes: changedAttributes}, '[fenix-login] error upserting user')
      return cb(err)
    }

    log.debug({id: result.id}, '[fenix-login] upserted user')

    return authenticate(result.id, null, cb)
  })
}

// /////////////////////////////////
// Third party login server methods
// /////////////////////////////////

function facebookAuth (id, token, cb) {
  async.waterfall([
    function debug (cbAsync) {
      debugFBToken(id, token, cbAsync)
    },
    function getUser (cbAsync) {
      getFBUser(id, token, cbAsync)
    }
  ], function done (err, result) {
    if (err) {
      log.error({err: err}, '[facebook-login] error on facebook login')
      return cb(err)
    }
    cb(null, result)
  })
}

function googleAuth (id, token, cb) {
  async.waterfall([
    function debug (cbAsync) {
      debugGToken(id, token, cbAsync)
    },
    function getUser (cbAsync) {
      getGUser(id, token, cbAsync)
    }
  ], function done (err, result) {
    if (err) {
      log.error({err: err}, '[google-login] error on google login')
      return cb(err)
    }
    cb(null, result)
  })
}

function fenixAuth (code, cb) {
  async.waterfall([
    function debug (cbAsync) {
      getFenixToken(code, cbAsync)
    },
    getFenixInfo,
    getFenixUser

  ], function done (err, result) {
    if (err) {
      log.error({err: err}, '[fenix-login] error on fenix login')
      return cb(err)
    }
    cb(null, result)
  })
}

// ////////////////////////////
// Add account server methods
// ////////////////////////////

function addGoogleAuth (user, id, token, cb) {
  async.waterfall([
    function debug (cbAsync) {
      debugGToken(id, token, cbAsync)
    },
    function addAccount (cbAsync) {
      google.getMe(id, (err, googleUser) => {
        if (err) {
          log.error({err: err, id: id, token: token}, '[google-login] error retrieving user info from google')
          return cbAsync(Boom.unauthorized('couldn\'t retrieve your info from google'))
        }

        google.getMail(token, (err, mail) => {
          if (err) {
            log.error({err: err, id: id, token: token}, '[google-login] error retrieving user email from google')
            return cbAsync(Boom.unauthorized('couldn\'t retrieve your info from google'))
          }

          if (!mail) {
            log.error({err: err, id: id, token: token}, '[google-login] user logged in without valid google e-mail')
            return cbAsync(Boom.notAcceptable('you must have a valid google e-mail'))
          }

          addGaccount(user, googleUser, mail, token, cbAsync)
        })
      })
    }
  ], function done (err, result) {
    if (err) {
      log.error({err: err}, 'error adding google account')
      return cb(err)
    }
    cb(null, result)
  })
}

function addFacebookAuth (user, id, token, cb) {
  async.waterfall([
    function debug (cbAsync) {
      debugFBToken(id, token, cbAsync)
    },
    function addAccount (cbAsync) {
      facebook.getMe(token, (err, facebookUser) => {
        if (err) {
          log.error({err: err, id: facebookUser.id, token: token}, '[facebook-login] error retrieving user info from facebook')
          return cbAsync(Boom.unauthorized('couldn\'t retrieve your info from facebook'))
        }

        if (!facebookUser.email) {
          log.error({err: err, id: facebookUser.id, token: token}, '[facebook-login] user logged in without valid facebook e-mail')
          return cbAsync(Boom.notAcceptable('you must have a valid facebook e-mail'))
        }

        log.debug({facebookUser: facebookUser.id}, '[facebook-login] got facebook user')

        addFBaccount(user, facebookUser, token, cbAsync)
      })
    }
  ], function done (err, result) {
    if (err) {
      log.error({err: err}, 'error adding google account')
      return cb(err)
    }
    cb(null, result)
  })
}

function addFenixAuth (user, code, cb) {
  async.waterfall([
    function debug (cbAsync) {
      getFenixToken(code, cbAsync)
    },

    getFenixInfo,

    function addAccount (fenixUser, cbAsync) {
      addFenixAccount(user, fenixUser, cbAsync)
    }

  ], function done (err, result) {
    if (err) {
      log.error({err: err}, 'error adding fenix account')
      return cb(err)
    }
    cb(null, result)
  })
}

// ////////////////////////////////////////////
// Helper functions to merge and update users
// ////////////////////////////////////////////

function updateUserAuth (filter, changedAttributes, cbAsync) {
  // Update the details of the user with this new auth info
  server.methods.user.update(filter, changedAttributes, (err, result) => {
    if (err) {
      log.error({err: err, user: filter, changedAttributes: changedAttributes}, '[login] error updating user')
      return cbAsync(err)
    }

    log.debug({id: result.id}, '[login] updated user auth')

    return cbAsync(null, result)
  })
}

function mergeAccount (user, other, cb) {
  const userId = user.id
  const otherId = other.id

  server.methods.user.remove(other.id, (err, result) => {
    if (err) {
      log.error({err: err, user: other.id}, '[merge-account] error removing dup account')
      return cb(err)
    }

    log.debug('[merge-account] removed dup account')

    async.parallel([
      function updateFiles (cbAsync) {
        async.parallel([
          function getUser (cbFile) {
            server.methods.file.get(userId, (err, result) => {
              if (err) {
                if (err.output && err.output.statusCode === 404) {
                  log.warn({err: err.message, user: userId}, '[merge-account] user has no file')
                  return cbFile()
                }
                log.error({err: err, user: userId, other: userId}, '[merge-account] error getting user file')
              }
              cbFile(err, result)
            })
          },
          function getOther (cbFile) {
            server.methods.file.get(otherId, (err, result) => {
              if (err) {
                if (err.output && err.output.statusCode === 404) {
                  log.warn({err: err.message, user: otherId}, '[merge-account] other user has no file')
                  return cbFile()
                }
                log.error({err: err, user: userId, other: otherId}, '[merge-account] error getting other user file')
              }
              cbFile(err, result)
            })
          }
        ], function gotFiles (err, results) {
          const userFile = results[0]
          const otherFile = results[1]
          let resultFile
          let deleteFile
          log.debug({results: results})
          if (err) {
            return cbAsync(err)
          }

          if (!userFile && !otherFile) {
            return cbAsync()
          }

          if (!userFile || !otherFile) {
            resultFile = userFile || otherFile
            resultFile.user = user.id
          } else {
            if (userFile.updated > otherFile.updated) {
              resultFile = userFile
              deleteFile = otherFile
            } else {
              resultFile = otherFile
              deleteFile = userFile
            }
            resultFile.user = user.id
          }

          async.parallel([
            function deleteFile (cbFile) {
              server.methods.file.delete(deleteFile.id, err => {
                if (err) {
                  log.warn({err: err, file: deleteFile.id}, '[merge-account] error deleting file')
                }
                cbFile()
              })
            },
            function deleteFileDb (cbFile) {
              server.methods.file.remove(deleteFile.id, (err, _file) => {
                if (err) {
                  log.error({err: err, file: deleteFile.id}, '[merge-account] error removing file from db')
                  return cbFile(err)
                }
                cbFile(null, _file)
              })
            }
          ], function updateFileDb (err, results) {
            if (err) {
              return cbAsync(err)
            }

            server.methods.file.update(resultFile.id, resultFile, (err, result) => {
              if (err) {
                log.error({err: err, file: resultFile.id}, '[merge-account] error updating file')
                return cbAsync(err)
              }
              return cbAsync(null, result)
            })
          })
        })
      },

      function updateTickets (cbAsync) {
        const filter = {$and: [{users: otherId}, {users: {$nin: [userId]}}]}
        const changedAttributes = {$set: {'users.$': userId}}
        server.methods.ticket.updateMulti(filter, changedAttributes, (err, tickets) => {
          if (err) {
            if (err.output && err.output.statusCode === 404) {
              log.warn({err: err.message, user: otherId}, '[merge-account] user had no tickets')
              return cbAsync()
            }
            log.error({err: err, user: userId, other: otherId}, '[merge-account] error updating tickets')
            return cbAsync(err)
          }
          cbAsync(null, tickets)
        })
      },

      function updateAchievements (cbAsync) {
        const filter = {$and: [{users: otherId}, {users: {$nin: [userId]}}]}
        const changedAttributes = {$set: {'users.$': userId}}
        server.methods.achievement.updateMulti(filter, changedAttributes, (err, achievements) => {
          if (err) {
            if (err.output && err.output.statusCode === 404) {
              log.warn({err: err.message, user: otherId}, '[merge-account] user had no achievements')
              return cbAsync()
            }
            log.error({err: err, user: userId, other: otherId}, '[merge-account] error updating achievements')
            return cbAsync(err)
          }
          cbAsync(null, achievements)
        })
      }
    ], function updateUser (err, results) {
      if (err) return cb(err)
      const filter = {id: user.id}
      let changedAttributes = {}

      changedAttributes = Hoek.applyToDefaults(other, user)
      changedAttributes.skills = _.union(other.skills, user.skills)
      server.methods.user.update(filter, changedAttributes, (err, user) => {
        if (err) {
          log.error({err: err, user: userId, other: otherId, update: changedAttributes}, '[merge-account] error updating user')
          return cb(err)
        }
        cb(null, user)
      })
    })
  })
}

// //////////////////////////////////////////
// Update user with new session credentials
// //////////////////////////////////////////

function authenticate (userId, changedAttributes, cb) {
  const newToken = Token.getJWT(userId)
  changedAttributes = changedAttributes || {}
  changedAttributes.$push = { bearer: newToken }

  server.methods.user.update({id: userId}, changedAttributes, (err, result) => {
    if (err) {
      log.error({user: userId, changedAttributes: changedAttributes}, '[login] error updating user')
      return cb(err)
    }
    log.info({user: userId}, '[login] user logged in ')
    return cb(err, newToken)
  })
}

// ///////////////////////////
// Refresh session method
// ///////////////////////////

function refreshToken (user, token, refresh, cb) {
  Token.verifyToken(user, refresh, true, (err, decoded) => {
    if (err) {
      return cb(err)
    }

    const newToken = Token.getJWT(user)
    const filter = {id: user, bearer: {$elemMatch: {refreshToken: refresh, token: token}}}
    const update = {$set: {'bearer.$': newToken}}

    server.methods.user.update(filter, update, (err, result) => {
      if (err) {
        log.error({user: user}, '[login] error updating user')
        return cb(Boom.unauthorized())
      }
      return cb(err, newToken)
    })
  })
}
