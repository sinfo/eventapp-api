const server = require('../../').hapi
const handlers = require('./handlers')
const log = require('../../helpers/logger')

server.route({
  method: 'POST',
  path: '/prizes',
  options: handlers.create.options,
  handler: handlers.create.handler
})

server.route({
  method: 'GET',
  path: '/prizes/session/{id}',
  options: handlers.getPrizeBySession.options,
  handler: handlers.getPrizeBySession.handler
})
