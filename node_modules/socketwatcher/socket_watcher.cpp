// Copyright (c) 2012 Toby Ealden.
// Copyright (c) 2014 Martin Man.
// vim: ts=2 sw=2 et

#include "socket_watcher.hpp"
#include <string.h>

using namespace v8;

Nan::Persistent<Function> constructor;

SocketWatcher::SocketWatcher() : poll_(NULL), fd_(0), events_(0)
{
}

void SocketWatcher::Initialize(Local<Object> exports)
{
  Nan::HandleScope scope;

  Local<FunctionTemplate> t = Nan::New<FunctionTemplate>(New);

  t->SetClassName(Nan::New("SocketWatcher").ToLocalChecked());
  t->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(t, "set", SocketWatcher::Set);
  Nan::SetPrototypeMethod(t, "start", SocketWatcher::Start);
  Nan::SetPrototypeMethod(t, "stop", SocketWatcher::Stop);

  constructor.Reset(t->GetFunction());
  exports->Set(Nan::New("SocketWatcher").ToLocalChecked(), t->GetFunction());
}

void SocketWatcher::Start(const Nan::FunctionCallbackInfo<Value>& info)
{
  SocketWatcher *watcher = Nan::ObjectWrap::Unwrap<SocketWatcher>(info.Holder());
  watcher->StartInternal();
}

void SocketWatcher::StartInternal()
{
  if (poll_ == NULL) {
    poll_ = new uv_poll_t;
    memset(poll_,0,sizeof(uv_poll_t));
    poll_->data = this;
    uv_poll_init_socket(uv_default_loop(), poll_, fd_);

    Ref();
  }

  if (!uv_is_active((uv_handle_t*)poll_)) {
    uv_poll_start(poll_, events_, &SocketWatcher::Callback);
  }
}

void SocketWatcher::Callback(uv_poll_t *w, int status, int revents)
{
  Nan::HandleScope scope;

  SocketWatcher *watcher = static_cast<SocketWatcher*>(w->data);
  assert(w == watcher->poll_);

  Local<String> callback_symbol = Nan::New("callback").ToLocalChecked();
  Local<Value> callback_v = Nan::Get(watcher->handle(), callback_symbol).ToLocalChecked();
  if(!callback_v->IsFunction()) {
    watcher->StopInternal();
    return;
  }

  Local<Function> callback = Local<Function>::Cast(callback_v);

  const unsigned argc = 2;
  Local<Value> argv[argc] = {
    revents & UV_READABLE ? Nan::True() : Nan::False(),
    revents & UV_WRITABLE ? Nan::True() : Nan::False(),
  };

  Nan::MakeCallback(watcher->handle(), callback, argc, argv);
}

void SocketWatcher::Stop(const Nan::FunctionCallbackInfo<Value>& info)
{
  SocketWatcher *watcher = Nan::ObjectWrap::Unwrap<SocketWatcher>(info.Holder());
  watcher->StopInternal();
}

void SocketWatcher::StopInternal() {
  if (poll_ != NULL && uv_is_active((uv_handle_t*)poll_)) {
    uv_poll_stop(poll_);
    Unref();
  }
}

void SocketWatcher::New(const Nan::FunctionCallbackInfo<Value>& info)
{
  Nan::HandleScope scope;
  if (info.IsConstructCall()) {
    // Invoked as constructor: `new SocketWatcher(...)`
    SocketWatcher *s = new SocketWatcher();
    s->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    // Invoked as plain function `SocketWatcher(...)`, turn into construct call.
    Local<Function> cons = Nan::New<Function>(constructor);
    info.GetReturnValue().Set(Nan::NewInstance(cons).ToLocalChecked());
  }
}

void SocketWatcher::Set(const Nan::FunctionCallbackInfo<Value>& info)
{
  SocketWatcher *watcher = Nan::ObjectWrap::Unwrap<SocketWatcher>(info.Holder());

  if(!info[0]->IsInt32()) {
    Nan::ThrowTypeError("First arg should be a file descriptor.");
    return;
  }
  int fd = info[0]->Int32Value();

  if(!info[1]->IsBoolean()) {
    Nan::ThrowTypeError("Second arg should a boolean (readable).");
    return;
  }
  int events = 0;
  if(info[1]->IsTrue()) events |= UV_READABLE;

  if(!info[2]->IsBoolean()) {
    Nan::ThrowTypeError("Third arg should a boolean (writable).");
    return;
  }
  if (info[2]->IsTrue()) events |= UV_WRITABLE;

  assert(watcher->poll_ == NULL);

  watcher->fd_ = fd;
  watcher->events_ = events;
}


void Init(Local<Object> exports)
{
  SocketWatcher::Initialize(exports);
}

NODE_MODULE(socketwatcher, Init)
