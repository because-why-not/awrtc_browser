# Building awrtc_browser

Run the following commands in the project root directory:

* npm install
* npm run build

Now you should have the final build in the ./build/bundle directory.

You can test it using the test applications (see callapp.ts):
* ./build/callapp.html for the typescrypt example using ./build/bundle/apps.js (contains the merged source code from ./src/apps and ./src/awrtc)
* ./build/callapp_js.html for javascript example that runs the same app but as javascript within the html file so you can easily change the code and experiment. It is using the library only bundle from ./build/bundle/awrtc.js (source code at ./src/awrtc)

# Configuration

If you want to connect awrtc_browser to compatible software make sure the NetworkConfig class contains the same values.
For example the callapp.ts uses these:
```
this.mNetConfig.IceServers = [ 
    {urls: "stun:t.y-not.app:443"},
    //{urls: "turn:t.y-not.app:443", username: "user", credential:"pass"},
    {urls: "stun:stun.l.google.com:19302"}
];
this.mNetConfig.IsConference = false;
this.mNetConfig.SignalingUrl = "wss://s.y-not.app/callapp";
```
Note by default no TURN server is used. If you need a more reliable connection through NAT's and firewalls add your own turn server to the IceServers list above.
See [server side tutorial](https://www.because-why-not.com/webrtc/tutorials-server-side/) for more information. 
If you purchased WebRTC Video Chat you can also find a free TURN server in your Unity examples (for testing purposes only). 

# Using awrtc_browser to customize WebRTC Video Chat

[WebRTC Video Chat](https://assetstore.unity.com/packages/tools/network/webrtc-video-chat-68030) is a unity asset that allows developers to build their own audio, video or data streaming applications in Unity C#. For this it builds on top of various plugins to access the platform specific WebRTC implementations. 
awrtc_browser is used as a Unity WebGL plugin to enable the Unity C# side to communicate with the browsers WebRTC API. Most C# side calls are routed through the file CAPI.ts and then access classes like BrowserMediaNetwork from there. 

You can customize WebRTC Video Chat by changing this codebase. Before introducing any changes make sure to checkout the version that corresponds to your Unity asset. e.g. V0.9858 correspons to version "1.985.8" in the package.json. 

To update the C# side run "npm run build" and then copy the file 
build/bundle/awrtc.js  (or awrtc.min.js) 
to your Unity project at:
WebRtcVideoChat/Resources/awrtc.js.txt
replacing the original file. 

Once the asset is initialized in C# using UnityCallFactory.EnsureInit it will automatically inject this file into the browser and thus load your custom awrtc_browser version. 

## What file to change?
Let's take as an example that you want to change the behaviour of the media access (e.g. using your own custom video track). 
In C# media access is done via the method ICall.Configure or IMediaNetwork.Configure. 

In the Unity WebGL version both of these interfaces are based on the class BrowserMediaNetwork (C#). Calls to the Configure method are executed like this:

1. BrowserMediaNetwork.Configure in C# file WebRtcVideoChat/scripts/browser/BrowerMediaNetwork.cs
2. calls CAPI.Unity_MediaNetwork_Configure in C# file CAPI.cs
3. calls Unity_MediaNetwork_Configure in JS file WebRtcVideoChat/Plugins/WebGL/awrtc_unity.jslib (emscripten / unity specific plugin file)
4. calls CAPI_MediaNetwork_Configure in the TS file at [CAPI.ts](src/awrtc/unity/CAPI.ts#L353)
5. calls BrowserMediaNetwork.Configure in the TS file [BrowserMediaNetwork.ts](src/awrtc/media_browser/BrowserMediaNetwork.ts#L102)

So to change the C# behaviour you can change Configure method in the typescript file BrowserMediaNetwork.ts and then rebuild via "npm run build".
After rebuild it is recommended to first test your changes in a browser only app (e.g. callapp.html) before building & testing your entire Unity WebGL app. This helps avoiding long build times and will result in better error messages. If possible avoid changing the CAPI and jslib files as errors in these can be very difficult to debug. 
