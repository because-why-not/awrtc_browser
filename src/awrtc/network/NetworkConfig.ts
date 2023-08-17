/*
Copyright (c) 2022, because-why-not.com Limited
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

import { IBasicNetwork, LocalNetwork, TextNetwork, WebsocketNetwork } from "./index";

export class NetworkConfig {

    private mIceServers = new Array<RTCIceServer>();

    public get IceServers(): RTCIceServer[] {
        return this.mIceServers;
    }

    public set IceServers(value: RTCIceServer[]) {
        this.mIceServers = value;
    }

    private mSignalingUrl: string = null;
    public get SignalingUrl() {
        return this.mSignalingUrl;
    }

    public set SignalingUrl(value: string) {
        this.mSignalingUrl = value;
    }

    private mIsConference = false;
    public get IsConference(): boolean {
        return this.mIsConference;
    }
    public set IsConference(value:boolean) {
        this.mIsConference = value;
    }
    
    private mMaxIceRestart = 0;
    public get MaxIceRestart(): number {
        if (this.mKeepSignalingAlive == false)
            return 0;
        return this.mMaxIceRestart;
    }
    public set MaxIceRestart(value:number) {
        this.mMaxIceRestart = value;
    }
    
    private mKeepSignalingAlive = false;
    public get KeepSignalingAlive(): boolean {
        return this.mKeepSignalingAlive;
    }
    public set KeepSignalingAlive(value:boolean) {
        this.mKeepSignalingAlive = value;
    }

    private mSignalingNetwork: IBasicNetwork = null;
    public get SignalingNetwork(): IBasicNetwork {
        return this.mSignalingNetwork;
    }
    public set SignalingNetwork(value:IBasicNetwork) {
        this.mSignalingNetwork = value;
    }

    //Either returns the signaling network set by the user
    //or creates a new one based on the set URL
    //TODO: Move this class to a factory
    public GetOrCreateSignalingNetwork() : IBasicNetwork {
        //create or reuse existing network instance
        if (this.mSignalingNetwork)
            return this.mSignalingNetwork;
        
        let res = null;
        if (this.mSignalingUrl == null || this.mSignalingUrl == "") {
            res = new LocalNetwork();
        } else if (this.mSignalingUrl.startsWith("text")) {
            res = new TextNetwork(this.mSignalingUrl);
        } else {
            res = new WebsocketNetwork(this.mSignalingUrl);
        }
        return res;
    }


    public BuildRtcConfig(): RTCConfiguration{
        let rtcConfig: RTCConfiguration = { iceServers: this.IceServers};
        return rtcConfig;
    }

    public Clone() {
        const res = new NetworkConfig();
        return this.CloneTo(res);
    }
    private CloneTo(res: NetworkConfig) {
        res.mIceServers = [].concat(this.mIceServers);
        res.mIsConference = this.mIsConference;
        res.mKeepSignalingAlive = this.mKeepSignalingAlive;
        res.mMaxIceRestart = this.mMaxIceRestart;
        res.mSignalingUrl = this.mSignalingUrl;

        //watch out this is the only component that can not be properly deep copied
        res.mSignalingNetwork = this.mSignalingNetwork;
        return res;
    }

    public FromJson(json: string) {
        const jsobj = JSON.parse(json);
        Object.assign(this, jsobj);
    }

    public IsEqual(other: NetworkConfig) : boolean{
        if (!other)
            return false;
        const ownj = JSON.stringify(this);
        const otherj = JSON.stringify(other);
        if (ownj != otherj)
            return false;
        return true;
    }

    public ToString(): string{
        return JSON.stringify(this);
    }

}