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
        description: model.description,
        title: model.title,
        img: model.img,
        company: model.company,
        sessions: model.sessions,
        updated: model.updated
    }
  }

