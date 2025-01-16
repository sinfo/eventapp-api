const server = require('../').hapi
const axios = require('axios').default
const path = require('path')
const log = require('../helpers/logger')
const config = require(path.join(__dirname, '..', '..', 'config'))


server.method('deck.getLatestEdition', getLatestEdition, {})
server.method('deck.getPreviousEdition', getPreviousEdition, {})
server.method('deck.getEvents', getEvents, {})
server.method('deck.getCompanies', getCompanies, {})
server.method('deck.getCompany', getCompany, {})
server.method('deck.getMembers', getMembers, {})
server.method('deck.getSessions', getSessions, {})
server.method('deck.getSession', getSession, {})
server.method('deck.getSpeakers', getSpeakers, {})
server.method('deck.getSpeaker', getSpeaker, {})

const DECK_API_URL = `${config.deck.url}`

async function getLatestEdition() {
  const event = await axios.get(`${DECK_API_URL}/public/events?current=true`, { json: true })
  return transformEvent(event.data[0])
}

async function getEvents() {
  const events = await axios.get(`${DECK_API_URL}/public/events`, { json: true })
  events.data.sort((a, b) => b.id - a.id) // Sort by id in descending order
  return events.data.map(event => transformEvent(event))
}

async function getPreviousEdition() {
  const events = await axios.get(`${DECK_API_URL}/public/events?pastEvents=true`, { json: true })
  events.data.sort((a, b) => b.id - a.id) // Sort by id in descending order
  return transformEvent(events.data[0])
}

async function getCompanies(edition) {
  const companies = await axios.get(`${DECK_API_URL}/public/companies?event=${edition}`, { json: true })
  return companies.data.map(company => transformCompany(company, { compact: true }))
}

async function getCompany(companyId) {
  const company = await axios.get(`${DECK_API_URL}/public/companies/${companyId}`, { json: true })
  company.data.participation.sort((a, b) => b.event - a.event) // Sort by event in descending order
  const companySessions = await axios.get(`${DECK_API_URL}/public/sessions?company=${companyId}`, { json: true })
  return transformCompany({ ...company.data, sessions: companySessions.data })
}

async function getMembers(edition) {
  const members = await axios.get(`${DECK_API_URL}/public/members?event=${edition}`, { json: true })
  members.data.sort((a, b) => a.name.localeCompare(b.name)) // Sort by name in ascending order
  return members.data.map(member => transformMember(member))
}

async function getSessions(edition, withoutAchievements) {
  const sessions = await axios.get(`${DECK_API_URL}/public/sessions?event=${edition}`)
  sessions.data.sort((a, b) => new Date(a.begin) - new Date(b.begin)) // Sort by date in ascending order
  if (withoutAchievements) {
    filteredSessions = [];
    for(const session of sessions.data) {
      var achievement = await server.methods.achievement.getAchievementBySession(session.id)
      if (!achievement) {
        filteredSessions.push(session);
      }
    }
    return filteredSessions.map(session => transformSession(session, {event: edition}))
  } else {
    return sessions.data.map(session => transformSession(session, {event: edition}))
  }
}

async function getSession(sessionId) {
  const session = await axios.get(`${DECK_API_URL}/public/sessions/${sessionId}`)
  session.data.company?.participation?.sort((a, b) => b.event - a.event) // Sort by event in descending order
  session.data.speaker?.forEach(speaker => speaker.participation?.sort((a, b) => b.event - a.event)) // Sort by event in descending order
  const sessionPrize = await server.methods.prize.getPrizeBySession(sessionId)
  return transformSession({...session.data, prize: sessionPrize ? {
      id: sessionPrize.id,
      name: sessionPrize.name,
      img: sessionPrize.img,
      edition: sessionPrize.edition
    } : undefined
  })
}

async function getSpeakers(edition) {
  const speakers = await axios.get(`${DECK_API_URL}/public/speakers?event=${edition}`)
  speakers.data.sort((a, b) => a.name.localeCompare(b.name)) // Sort by name in ascending order
  return speakers.data.map(speaker => transformSpeaker(speaker))
}

async function getSpeaker(speakerId) {
  const speaker = await axios.get(`${DECK_API_URL}/public/speakers/${speakerId}`)
  const speakerSessions = await axios.get(`${DECK_API_URL}/public/sessions?speaker=${speakerId}`, { json: true })
  return transformSpeaker({ ...speaker.data, sessions: speakerSessions.data })
}


// Translate Deck's event object to old format
function transformEvent(event, options) {
  return {
    id: String(event.id),
    name: event.name,
    kind: options?.kind || "Main Event",
    public: options?.public || true,
    date: event.begin,
    duration: new Date(new Date(event.end) - new Date(event.begin)),
    calendarUrl: event.calendarUrl
  }
}

// Translate Deck's company object to old format
function transformCompany(company, options) {
  const advertisementLevels = {
    "Diamond": "exclusive",
    "Platinum": "max",
    "Gold": "med",
    "Gold NPE": "med",
    "Silver": "min",
    "Silver NPE": "min",
  };
  const participation = company.participation?.length > 0 && company.participation[0]; // Get the latest participation
  const advertisementLvl = advertisementLevels[participation?.package.name] || (participation?.partner && "other") || "none";

  return {
    id: company.id,
    name: company.name,
    img: company.img,
    site: company.site,
    description: company.description,
    advertisementLvl: options?.compact ? advertisementLvl : {
      advertisementLvl,
      kind: participation?.package.name || (participation?.partner && "Partner"),
      items: participation?.package.items,
    },
    sessions: company.sessions?.map(s => transformSession(s)),
    standDetails: options?.compact ? undefined : participation.standDetails,
    stands: options?.compact ? undefined : participation.stands
  }
}

// Translate Deck's member object to old format
function transformMember(member) {
  return {
    name: member.name,
    img: member.img || "/static/default-profile.png",
  }
}

// Translate Deck's session object to old format
function transformSession(session, options) {
  const sessionKinds = {
    "TALK": "Keynote",
    "WORKSHOP": "Workshop",
    "PRESENTATION": "Presentation"
  }

  return {
    id: session.id,
    name: session.title,
    description: session.description,
    kind: sessionKinds[session.kind] || session.kind,
    event: String(options?.event || (session.company?.participation?.length > 0 && session.company.participation[0].event)),
    date: session.begin,
    duration: new Date(new Date(session.end) - new Date(session.begin)).getTime() / (1000 * 60),
    place: session.place,
    img: session.img || session.company?.img || (session.speaker.length > 0 && session.speaker[0].imgs.speaker),
    company: session.company && transformCompany(session.company, { compact: true }),
    speakers: session.speaker?.length ? session.speaker.map(s => transformSpeaker(s)) : undefined,
    tickets: session.tickets && {
      needed: !!session.tickets,
      start: session.tickets?.start,
      end: session.tickets?.end,
      max: session.tickets?.max,
    },
    prize: session.prize
  }
}

// Translate Deck's speaker object to old format
function transformSpeaker(speaker) {
  return {
    id: speaker.id,
    description: speaker.bio,
    name: speaker.name,
    title: speaker.title,
    img: speaker.imgs.speaker,
    company: {
      name: speaker.companyName,
      img: speaker.imgs.company,
    },
    sessions: speaker.sessions?.map(s => transformSession(s)),
    feedback: speaker.participation[0].feedback
  }
}
