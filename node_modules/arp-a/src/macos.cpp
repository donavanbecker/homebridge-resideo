#include <node.h>
extern "C" {
#include <stdlib.h>

#include <sys/types.h>
#include <sys/sysctl.h>

#include <net/if.h>
#include <net/route.h>
#include <netinet/if_ether.h>
#include <net/if_dl.h>

#include <ifaddrs.h>
#include <arpa/inet.h>
}

namespace Arp {
  using namespace v8;
  using namespace node;

  void ArpTable(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    int     mib[] = { CTL_NET, PF_ROUTE, 0, AF_INET, NET_RT_FLAGS, RTF_LLINFO, 0 };
    size_t  len = 0;
    char   *head, *ptr, *tail;

  // step 1: fetch the arp table

    if (sysctl(mib, (sizeof mib / sizeof mib[0]) - 1, NULL, &len, NULL, 0) < 0) {
      isolate->ThrowException(v8::Exception::Error(String::NewFromUtf8(isolate, "sysctl failed to get length for ARP table.")));
      return;
    }

    if ((head = ((char *) malloc(len))) == NULL) {
      isolate->ThrowException(v8::Exception::Error(String::NewFromUtf8(isolate, "malloc failed to allocate return buffer for ARP table.")));
      return;
    }

    if (sysctl(mib, (sizeof mib / sizeof mib[0]) - 1, head, &len, NULL, 0) < 0) {
      isolate->ThrowException(v8::Exception::Error(String::NewFromUtf8(isolate, "sysctl failed to retrieve ARP table.")));
      return;
    }
    tail = head + len;

  // step 2: count the number of entries and make an array

    int    i = 0;
    struct rt_msghdr *rtm;

    for (ptr = head; ptr < tail; ptr += rtm->rtm_msglen) {
      rtm = (struct rt_msghdr *) ptr;

      struct sockaddr_inarp *sin = (struct sockaddr_inarp *) (rtm + 1);
      struct sockaddr_dl    *sdl = (struct sockaddr_dl *) (sin + 1);

      if (sdl->sdl_alen > 0) i++;
    }

    Local<Array> result = Array::New(isolate);

  // step 3: fill-in the array

    i = 0;
    struct if_nameindex *ifp = if_nameindex();
    for (ptr = head; ptr < tail; ptr += rtm->rtm_msglen) {
      rtm = (struct rt_msghdr *) ptr;

      struct sockaddr_inarp *sin = (struct sockaddr_inarp *) (rtm + 1);
      struct sockaddr_dl    *sdl = (struct sockaddr_dl *) (sin + 1);

      char    lladdr[(6 * 3) + 1];
      u_char *ll = (u_char *) LLADDR(sdl);
      if (sdl->sdl_alen == 0) continue;

      struct if_nameindex *ifx = NULL;
      if (ifp) {
        for (ifx = ifp; (ifx -> if_index != 0) && (ifx -> if_name != NULL); ifx++) if (ifx->if_index == rtm-> rtm_index) break;
      }
      snprintf(lladdr, sizeof lladdr, "%02x:%02x:%02x:%02x:%02x:%02x", ll[0], ll[1], ll[2], ll[3], ll[4], ll[5]);

      Local<Object> entry = Object::New(isolate);
      entry->Set(String::NewFromUtf8(isolate, "ip"), String::NewFromUtf8(isolate, inet_ntoa(sin->sin_addr)));
      entry->Set(String::NewFromUtf8(isolate, "ifname"), String::NewFromUtf8(isolate, ifx ? ifx -> if_name : ""));
      entry->Set(String::NewFromUtf8(isolate, "mac"), String::NewFromUtf8(isolate, lladdr));
      result->Set(i++, entry);
    }

    if_freenameindex(ifp);
    free (head);

    args.GetReturnValue().Set(result);
    }

  void Init(Local<Object> exports) {
    NODE_SET_METHOD(exports, "arpTable", ArpTable);
  }

  NODE_MODULE(macos, Init);
}
