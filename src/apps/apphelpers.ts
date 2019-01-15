/*
Copyright (c) 2019, because-why-not.com Limited
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
import * as awrtc from "../awrtc";

/**
 * Contains default values / servers used for example and test apps.
 * 
 * Note that these servers might not be online forever. Feel free to
 * run your own servers and update the url's below.
 */
export class DefaultValues
{
    private static SignalingUrl= "ws://signaling.because-why-not.com";
    private static SecureSignalingUrl= "wss://signaling.because-why-not.com";


    private static get SignalingBase():string
    {
        if (window.location.protocol != "https:") {
             return DefaultValues.SignalingUrl;
        } else
        {
            return DefaultValues.SecureSignalingUrl;
        }
    }
    /**
     * Returns the signaling server URL using ws for http pages and 
     * wss for https. The server url here ends with "test" to avoid
     * clashes with existing callapp. 
     */
    public static get Signaling():string
    {
        return DefaultValues.SignalingBase + "/test";
    }


    /**
     * Returns the signaling server URL using ws for http pages and 
     * wss for https. The server url here ends with "testshared" to avoid
     * clashes with existing conference app.
     * This url of the server usually allows shared addresses for 
     * n to n connections / conference calls. 
     */
    public static get SignalingShared():string
    {
        return DefaultValues.SignalingBase + "/testshared";
    }


    private static get StunServer() : RTCIceServer
    {
        let res : RTCIceServer = {
            urls: "stun:stun.l.google.com:19302"
        };
        return res;
    }

    /**
     * Returns ice servers used for testing.
     * Might only return the free google stun server. Without an
     * additional turn server connections might fail due to firewall.
     * Server might be unavailable in China. 
     */
    public static get IceServers(): RTCIceServer[]
    {
        return [DefaultValues.StunServer];
    }
}



//
export function GetParameterByName(name : string, url?:string) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

//Returns a random string
export function GetRandomKey(): string {

    var result = "";
    for (var i = 0; i < 7; i++) {
        result += String.fromCharCode(65 + Math.round(Math.random() * 25));
    }
    return result;
}