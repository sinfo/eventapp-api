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
      site: model.site,
      advertisementLvl: model.advertisementLvl,
      img: model.img,
      sessions: model.sessions,
      standDetails: model.standDetails,
      stands: model.stands
  }
}

