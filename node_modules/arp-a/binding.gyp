{
  'targets': [
    {
      'target_name': 'macos',
      'conditions': [
        ['OS=="mac"', {
          'sources': [
            'src/macos.cpp'
          ],
          # cflags on OS X are stupid and have to be defined like this
          'defines': [
            '_FILE_OFFSET_BITS=64',
            '_LARGEFILE_SOURCE'
          ],
          'xcode_settings': {
            'OTHER_CFLAGS': [
              '-Wall',
              '-ObjC++'
            ]
          }
        }]
      ]
    }
  ]
}