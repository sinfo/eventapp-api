const Joi = require('joi')
const log = require('../../helpers/logger')
const Boom = require('@hapi/boom')
const configUpload = require('../../../config').upload
const render = require('../../views/prize')

exports = module.exports

exports.create = {
  options: {
    tags: ['api', 'prize'],
    auth: {
      strategies: ['default'],
      scope: ['team', 'admin']
    },
    payload: {
      output: 'stream',
      multipart: true,
      parse: true,
      allow: 'multipart/form-data',
      maxBytes: configUpload.maxSize
    },
    validate: {
      payload: Joi.object({
        id: Joi.string().description('Id of the prize'),
        name: Joi.string().required().description('Name of the prize'),
        img: Joi.any().meta({ swaggerType: 'file' }).required().description('Image of the prize'),
        sessions: Joi.array().items(Joi.string()).description('Id of a session associated to this prize'),
      })
    },
    description: 'Creates a new prize'
  },
  handler: async (request, h) => {
    try {
      const edition = await request.server.methods.deck.getLatestEdition()
      let prize = await request.server.methods.prize.create(request.payload, edition.id)
      return h.response(render(prize)).created('/prize/' + prize.id)
    } catch (err) {
      log.error({ err: err, msg: 'error creating prize' }, 'error creating prize')
      throw Boom.boomify(err)
    }
  }
}

exports.getPrizeBySession = {
  options: {
    tags: ['api', 'prize', 'session'],
    auth: {
      strategies: ['default'],
      scope: ['team', 'admin']
    },
    validate: {
      params: Joi.object({
        id: Joi.string().description('ID of the session associated with the prize')
      })
    },
    description: 'Gets an prize by session ID'
  },
  handler: async function (request, h) {
    const sessionId = request.params.id
    try {
      let prize = await request.server.methods.prize.getPrizeBySession(sessionId)
      if (!prize) {
        log.error({ err: 'not found', session: sessionId }, 'prize not found')
        throw Boom.notFound('prize not found')
      }
      return h.response(render(prize))
    } catch (err) {
      log.error({ err: err, session: sessionId }, 'error getting prize')
      throw Boom.internal('error getting prize')
    }
  }
}
