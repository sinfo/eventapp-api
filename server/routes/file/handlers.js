      user: Joi.string().required().description('File user'),
    reply(render(request.pre.file)).created('/file/'+request.pre.file.id);
  description: 'Creates a new file model'
      user: Joi.string().description('File user'),
  description: 'Updates a file model'
    scope: ['admin']
      id: Joi.string().required().description('Id or user of the file we want to retrieve'),
  description: 'Gets the model of the file'
exports.getMe = {
  tags: ['api','file'],
  auth: {
    strategies: ['default', 'backup'],
    scope: ['user', 'admin']
  },
  pre: [
    { method: 'file.get(auth.credentials.user.id, query)', assign: 'file' }
  ],
  handler: function (request, reply) {
    reply(render(request.pre.file));
  },
  description: 'Gets the file model of the user'
};
  description: 'Gets all the file models'
exports.removeMe = {
  tags: ['api','file'],
  auth: {
    strategies: ['default', 'backup'],
    scope: ['user', 'admin']

  },
  pre: [
    { method: 'file.remove(auth.credentials.user.id)', assign: 'file' }
  ],
  handler: function (request, reply) {
    reply(render(request.pre.file));
  },
  description: 'Removes user file'
};

    query: {
      upsert: Joi.string().default('true'),
    },
      id: Joi.string().required().description('Id of the user whose file we want to upload'),
    },
    payload: Joi.object().pattern(/(\w*\W*)*/,
      Joi.object({
        pipe: Joi.func().required().description('File stream'),
        hapi: Joi.object({
          filename: Joi.string().required().description('File name'),
          headers: Joi.object({
            'content-type': Joi.string().required().description('File mime type'),
            'content-disposition': Joi.string().required().regex(/\w*\W*filename\w*\W*/).description('File name')
          }).unknown().required().description('File headers')
        }).required().description('File')
      }).unknown()
    ).required().length(1)
  },
  pre: [
    { method: 'user.get(params.id)', assign: 'user' },
    { method: 'file.uploadCV(payload)', assign: 'file' },
    { method: 'file.get(auth.credentials.user.id)', assign: 'oldFile', failAction: 'log'},
    [
      { method: 'file.delete(pre.oldFile.id)', assign: 'deleteFile', failAction: 'log'},
      { method: 'file.update(pre.oldFile.id, pre.file, auth.credentials.user.id, query)', assign: 'fileInfo' }
    ]
  ],
  handler: function (request, reply) {
    reply(render(request.pre.fileInfo)).created('/api/file/'+request.pre.fileInfo.id);
  },
  description: 'Uploads a file'
};

exports.uploadMe = {
  tags: ['api','file'],
  auth: {
    strategies: ['default', 'backup'],
    scope: ['user', 'admin']
  },
  payload: {
    output: 'stream',
    parse: true,
    allow: 'multipart/form-data',
    maxBytes: configUpload.maxSize
  },
  validate: {
    query: {
      upsert: Joi.string().invalid('false').default('true'),
    ).required().length(1)
    { method: 'file.uploadCV(payload)', assign: 'file' },
    { method: 'file.get(auth.credentials.user.id)', assign: 'oldFile', failAction: 'log'},
    [
      { method: 'file.delete(pre.oldFile.id)', assign: 'deleteFile', failAction: 'log'},
      { method: 'file.update(pre.oldFile.id, pre.file, auth.credentials.user.id, query)', assign: 'fileInfo' }
    ]
  description: 'Uploads a file of the user'