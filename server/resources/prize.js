const Boom = require('@hapi/boom')
const server = require('../').hapi
const aws = require('../plugins/aws')
const uuid = require('uuid')
const log = require('../helpers/logger')
const Prize = require('../db/prize')

server.method('prize.create', create, {})
server.method('prize.getPrizeBySession', getPrizeBySession, {})

async function create(data, editionId) {
  let prize = {
    id: data.id,
    name: data.name,
    img: data.img,
    edition: editionId,
    sessions: data.sessions
  }

  prize.id = prize.id || uuid.v4()
  prize.updated = prize.created = Date.now()

  const imgUrl = await uploadPrizeImage(prize, data.img)
  if (!imgUrl) {
    log.error('Error setting image URL for prize ' + prize.id)
    throw Boom.internal('Error setting image URL for prize ' + prize.id)
  }

  prize.img = imgUrl

  return Prize.create(prize).catch((err) => {
    if (err.code === 11000) {
      log.error({ msg: "prize is a duplicate" })
      throw Boom.conflict(`prize is a duplicate`)
    }
    throw err
  })

}

async function getPrizeBySession(id) {
  let filter = { sessions: id }

  return Prize.findOne(filter)
}

/* Image Functions */
function getDataFromStream(stream) {
  return new Promise((resolve, reject) => {
    let data = []

    stream.on('data', (chunk) => {
      data.push(chunk)
    })

    stream.on('end', () => {
      resolve(Buffer.concat(data))
    })

    stream.on('error', (err) => {
      reject(err)
    })
  })
}

function getFileName(prize) {
  return prize.id + '.webp'
}

function getPrizePath(prize) {
  return `static/${prize.edition}/prizes/`
}

async function uploadPrizeImage(prize, file) {
  const path = getPrizePath(prize)
  const fileName = getFileName(prize)
  const data = await getDataFromStream(file)
  return aws.upload(path, data, fileName, true)
}

async function removePrizeImage(prize) {
  const path = getPrizePath(prize)
  const fileName = getFileName(prize)
  return aws.delete(path, fileName)
}
