var server     = require('../../index').hapi;
var handlers   = require('./handlers');
var validators = require('./validators');

server.route({
  method: 'GET',
  path: '/api/redeemCode',
  config: {
    handler: handlers.list,
    auth: true,
    validate: {
      params: false,
      query: false
    }
  }
});

server.route({
  method: 'GET',
  path: '/api/redeemCode/{id}',
  config: {
    handler: handlers.get,
    auth: true,
    validate: validators.get
  }
});

server.route({
  method: 'PUT',
  path: '/api/redeemCode/{id}',
  config: {
    handler: handlers.update,
    auth: true,
    validate: validators.update
  }
});

server.route({
  method: 'POST',
  path: '/api/redeemCode',
  config: {
    handler: handlers.create,
    auth: true,
    validate: validators.create
  }
});