const Boom = require('boom')
const server = require('../').hapi
const log = require('../helpers/logger')
const fieldsParser = require('../helpers/fieldsParser')
const Link = require('../db/link')

server.method('link.create', create, {})
server.method('link.update', update, {})
server.method('link.get', get, {})
server.method('link.list', list, {})
server.method('link.remove', remove, {})

function create (companyId, link, cb) {
  link = {
    company: companyId,
    edition: link.editionId,
    user: link.userId,
    attendee: link.attendeeId,
    note: link.note,
    updated: Date.now(),
    created: Date.now()
  }

  Link.create(link, (err, _link) => {
    if (err) {
      if (err.code === 11000) {
        return cb(Boom.conflict(`Link "${link.id}" is a duplicate`))
      }

      log.error({err: err, link: link}, 'error creating link')
      return cb(Boom.internal())
    }

    cb(null, _link.toObject({ getters: true }))
  })
}

function update (filter, link, cb) {
  log.debug({filter: filter, link: link}, 'updating link')

  filter = {
    company: filter.companyId,
    edition: link.editionId,
    attendee: filter.attendeeId
  }

  link.updated = Date.now()

  Link.findOneAndUpdate(filter, link, (err, _link) => {
    if (err) {
      log.error({err: err, link: filter}, 'error updating link')
      return cb(Boom.internal())
    }
    if (!_link) {
      log.error({err: err, link: filter}, 'error updating link')
      return cb(Boom.notFound())
    }

    cb(null, _link.toObject({ getters: true }))
  })
}

function get (filter, editionId, cb) {
  log.debug({filter: filter, edition: editionId}, 'getting link')

  filter = {
    company: filter.companyId,
    edition: editionId,
    attendee: filter.attendeeId
  }

  Link.findOne(filter, (err, link) => {
    log.error({err: err})
    if (err) {
      log.error({err: err, link: filter}, 'error getting link')
      return cb(Boom.internal('error getting link'))
    }
    if (!link) {
      log.error({err: 'not found', link: filter}, 'link not found')
      return cb(Boom.notFound('link not found'))
    }

    cb(null, link.toObject({ getters: true }))
  })
}

function list (filter, query, cb) {
  log.debug({filter: filter}, 'list link')

  cb = cb || query // fields is optional

  if (typeof filter === 'string') {
    filter = { company: filter }
  }

  if (query && query.editionId) {
    filter.edition = query.editionId
  }

  const fields = fieldsParser(query.fields)
  const options = {
    skip: query.skip,
    limit: query.limit,
    sort: fieldsParser(query.sort)
  }

  Link.find(filter, fields, options, (err, links) => {
    if (err) {
      log.error({err: err}, 'error getting all links')
      return cb(Boom.internal())
    }

    cb(null, links)
  })
}

function remove (filter, editionId, cb) {
  log.debug({filter: filter, edition: editionId}, 'removing link')

  filter = {
    company: filter.companyId,
    edition: editionId,
    attendee: filter.attendeeId
  }

  Link.findOneAndRemove(filter, (err, link) => {
    if (err) {
      log.error({err: err, link: editionId}, 'error deleting link')
      return cb(Boom.internal())
    }
    if (!link) {
      log.error({err: 'not found', link: editionId}, 'error deleting link')
      return cb(Boom.notFound('link not found'))
    }

    return cb(null, link)
  })
}