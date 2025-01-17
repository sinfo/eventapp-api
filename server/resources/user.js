const Boom = require('@hapi/boom')
const server = require('../').hapi
const log = require('../helpers/logger')

const fieldsParser = require('../helpers/fieldsParser')
const config = require('../../config')
const User = require('../db/user')

server.method('user.create', create, {})
server.method('user.update', update, {})
server.method('user.updateMe', updateMe, {})
server.method('user.get', get, {})
server.method('user.getByToken', getByToken, {})
server.method('user.list', list, {})
server.method('user.getMulti', getMulti, {})
server.method('user.remove', remove, {})
server.method('user.removeCompany', removeCompany, {})
server.method('user.sign', sign, {})
server.method('user.redeemCard', redeemCard, {})
server.method('user.linkUsers', linkUsers, {})
server.method('user.setSharePermissions', setSharePermissions, {})


async function create(user) {
  user.id = user.id || Math.random().toString(36).substr(2, 20)
  user.role = user.role || config.auth.permissions[0]
  user.resgistered = user.resgistered || Date.now()
  user.updated = user.updated || Date.now()

  return User.create(user)
}


async function updateMe(filter, user, opts) {
  // if (typeof opts === 'function') {
  //   cb = opts
  //   opts = {}
  // }

  // role can only be user
  log.error('here')
  if (user.role && user.role !== 'user') {
    throw Boom.unauthorized('Can only demote self, not promte')
  }

  return update(filter, user, opts)
}

async function update(filter, user, opts) {
  user.updated = Date.now()

  if (typeof filter === 'string') {
    filter = { id: filter }
  }

  if (user && user.company) {
    const user2 = Object.assign({}, user)
    if (!user.company.edition) {
      const latestEdition = await request.server.methods.deck.getLatestEdition()
      user.company.edition = latestEdition.id;
    }
    user.$pull = { 'company': { 'edition': user.company.edition } }
    user2.$push = { 'company': user.company }
    delete user.company
    delete user2.company


    log.error({ filter: filter, user: user, opts: opts })

    await User.findOneAndUpdate(filter, user, opts).catch((err) => {
      log.error({ err: err }, 'error pulling user.company')
      throw Boom.boomify(err)
    })

    if (opts) {
      opts.new = true
    } else {
      opts = { new: true }
    }
    return await User.findOneAndUpdate(filter, user2, opts).catch((err) => {
      log.error({ err: err }, 'error pushing user.company')
      throw Boom.boomify(err)
    })
  } else {
    return await User.findOneAndUpdate(filter, user, { new: true })
  }
}

async function get(filter, query) {

  let fields = {}
  if (query) {
    fields = fieldsParser(query.fields)
  }

  if (typeof filter === 'string') {
    filter = { id: filter }
  }

  return User.findOne(filter, fields) //fields is always empty ¯\_(ツ)_/¯
}

async function getByToken(token) {
  let user = await User.findOne({ 'bearer.token': token })
  if (!user) {
    log.error({ err: err, requestedUser: user }, 'error getting user')
    return cb(Boom.notFound())
  }
  return user
}

async function list(activeAchievements) {
  const usersToSearch = []
  const points = {}

  // list unique users at their points
  activeAchievements.forEach(achv => {
    achv.users.forEach(user => {
      if (usersToSearch.indexOf(user) === -1) {
        usersToSearch.push(user)
        points[user] = 0
      }

      /**
       * ADAPT TO SPEED DATES !!!!
       */
      points[user] += achv.value
    })
  })

  const fields = {
    id: 1,
    name: 1,
    img: 1
  }

  let users = await User.find({ id: { $in: usersToSearch } }, fields)

  for (var i = 0; i < users.length; i++) {
    users[i]['points'] = points[users[i].id]
  }

  // sort by points in descending order
  users.sort(function (a, b) { return b.points - a.points })

  return users
}

async function getMulti(ids, query) {
  const filter = { id: { $in: ids } }

  if (query) {
    const fields = fieldsParser(query.fields)
    const options = {
      skip: query.skip,
      limit: query.limit,
      sort: fieldsParser(query.sort)
    }
    return User.find(filter, fields, options)
  } else {
    return User.find(filter)
  }

}

async function removeCompany(filter, editionId) {
  if (typeof filter === 'string') {
    filter = { id: filter }
  }

  const update = {
    $pull: {
      'company': { edition: editionId }
    }
  }

  let user = await User.findOneAndUpdate(filter, update, { new: true })
  if (!user) {
    log.error({ err: err, requestedUser: filter, edition: editionId }, 'error deleting user.company')
    return cb(Boom.notFound())
  }
  return user
}

async function remove(filter) {
  if (typeof filter === 'string') {
    filter = { id: filter }
  }

  return await User.findOneAndRemove(filter)
  // if (err) {
  //   log.error({ err: err, requestedUser: filter }, 'error deleting user')
  //   return cb(Boom.internal())
  // }
  // if (!user) {
  //   log.error({ err: err, requestedUser: filter }, 'error deleting user')
  //   return cb(Boom.notFound())
  // }

}

async function sign(attendeeId, companyId, day, editionId) {
  // todo verify

  let user = await get({ "id": attendeeId }).catch((err) => {
    log.error({ err: err, attendeeId: attendeeId, companyId: companyId, day: day, editionId: editionId }, 'Error signing user')
    throw Boom.boomify(err)
  })

  if (user.role === "company") {
    throw Boom.badData('invalid signature')
  }

  const filter = {
    id: attendeeId,
    signatures: {
      $elemMatch: {
        day: day,
        edition: editionId
      }
    }
  }

  const sig = { companyId: companyId, date: new Date() }

  const update = {
    $addToSet: {
      'signatures.$.signatures': sig
    }
  }

  user = await User.findOneAndUpdate(filter, update, { new: true }).catch((err) => {
    log.error({ err: err, attendeeId: attendeeId, companyId: companyId, day: day, editionId: editionId }, 'Error signing user')
    throw Boom.boomify(err)
  })

  if (!user) {
    // day,event combination entry did not exist
    return addNewDayEntry(
      { id: filter.id },
      {
        $push: {
          signatures: {
            day: day,
            edition: editionId,
            signatures: [sig]
          }
        }
      }
    )
  }
  return user
}

async function addNewDayEntry(filter, update) {
  let user = await User.findOneAndUpdate(filter, update, { new: true }).catch((err) => {
    log.error({ err: err }, 'Error signing user')
    throw Boom.boomify(err)
  })
  if (!user) {
    log.error({ err: err, msg: 'error signing user' }, 'Error signing user')
    throw Boom.notFound()
  }
  return user
}

async function redeemCard(attendeeId, day, editionId) {
  // todo verify
  const filter = {
    id: attendeeId,
    signatures: {
      $elemMatch: {
        day: day,
        edition: editionId
      }
    }
  }

  const update = {
    $set: {
      'signatures.$.redeemed': true
    }
  }

  // this should not be here
  let user = await User.findOne(filter).catch((err) => {
    log.error({ err: err, attendeeId: attendeeId, day: day, editionId: editionId }, 'Error getting user')
    throw Boom.internal()
  })

  if (!user) {
    // day,event combination entry did not exist
    log.error({ attendeeId: attendeeId, day: day, editionId: editionId }, 'Error getting user')
    throw Boom.notFound()
  }

  // this should not be hardcoded
  let signatures = user.signatures.filter(s => s.day === day && s.edition === editionId)

  if (signatures.length != 1) {
    log.error({ user: user }, 'user signatures length is different from 1')
    throw Boom.preconditionFailed("user signatures length is different from 1")
  }

  if (signatures && signatures[0].signatures.length < 10) {
    log.error({ user: user }, 'not enough signatures to validate card')
    throw Boom.badData({ user: user }, 'not enough signatures to validate card')
  }

  if (signatures[0].redeemed !== undefined && signatures[0].redeemed) {
    log.error({ user: user }, 'card already validated')
    throw Boom.conflict({ user: user }, 'card already validated')
  }

  user = await User.findOneAndUpdate(filter, update, { new: true })
  if (!user) {
    // day,event combination entry did not exist
    log.error({ err: err, attendeeId: attendeeId, day: day, editionId: editionId }, 'Error signing user')
    throw Boom.notFound()
  }
  return user
}

async function linkUsers(filter, newID, currEdition) { // Share user links
  if (typeof filter === 'string') {
    filter = { id: filter }
  }

  let user = await User.findOne(filter)
  if (!user.linkShared) {
    user.linkShared = []
  }

  let editionLinks = user.linkShared.find((el) => {
    el.edition === currEdition
  })

  if (!editionLinks) {
    editionLinks = {
      edition: currEdition,
      links: [newID]
    }

    user.linkShared.push(editionLinks)
  } else {
    editionLinks.links.push(newID)
  }

  return await user.save()
}

async function setSharePermissions(filter, edition) {

  let eventEnd = new Date(new Date(edition.date).getTime() + new Date(edition.duration).getTime())

  let unixEvent = Math.floor(eventEnd.getTime() / 1000)

  if (typeof filter === 'string') {
    filter = { id: filter }
  }
  let user = await User.findOne(filter)

  let now = new Date()
  let unixNow = Math.floor(now.getTime() / 1000)

  let update

  if (unixNow <= unixEvent) {
    update = {
      $set: {
        shareLinks: false
      }
    }
  } else {
    update = {
      $set: {
        shareLinks: !user.shareLinks
      }
    }
  }

  return await User.findOneAndUpdate(filter, update)
}