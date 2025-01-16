module.exports = function render (content) {
    if (content instanceof Array) {
      return content.map(renderObject)
    }

    return renderObject(content)
  }

  function renderObject (model) {
    return {
        id: model.id,
        name: model.name,
        kind: model.kind,
        img: model.img,
        place: model.place,
        description: model.description,
        speakers: model.speakers,
        company: model.company,
        date: model.date,
        duration: model.duration,
        updated: model.updated,
        event: model.event,
        tickets: model.tickets,
        prize: model.prize
    }
  }

