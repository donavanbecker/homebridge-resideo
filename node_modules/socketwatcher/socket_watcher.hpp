// Copyright (c) 2012 Toby Ealden.
// Copyright (c) 2014 Martin Man.
// vim: ts=2 sw=2 et

#ifndef SOCKETWATCHER_HPP
#define SOCKETWATCHER_HPP

#include <nan.h>
#include <uv.h>

class SocketWatcher : public Nan::ObjectWrap
{
  public:
    SocketWatcher();

    static void Initialize(v8::Local<v8::Object> exports);

  private:
    uv_poll_t* poll_;
    int fd_;
    int events_;

    static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void Set(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void Start(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void Stop(const Nan::FunctionCallbackInfo<v8::Value>& info);

    void StartInternal();
    void StopInternal();
    static void Callback(uv_poll_t *w, int status, int events);
};

#endif
