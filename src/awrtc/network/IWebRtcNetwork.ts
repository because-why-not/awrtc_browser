/*
Copyright (c) 2023, because-why-not.com Limited
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
/*
 * Interface for WebRtc specific features. These can be browser / java script specific
 * but losely follow the C# implementation. Keep naming consistant with C#/C++ 
 * implementation when possible.
 * 
 * Note this can now contain media specific features as well. 
 */
import { ConnectionId, IBasicNetwork } from "INetwork"

export enum RtcEventType{
    Invalid = 0,
    //do not change. must match C# side.
    Stats = 10,
    //1000 and below can be used for java script side features. will be ignored by C#
    StreamAdded = 1000,
}
/**Used to expose WebRTC specific events. 
 * Unlike NetworkEvent these are less standardized and contain browser specific events.
 */
export class RtcEvent{
    private mType: RtcEventType;
    public get EventType(): RtcEventType
    {
        return this.mType;
    }
    private mId: ConnectionId;
    public get ConnectionId(): ConnectionId
    {
        return this.mId;
    }
    constructor(tp: RtcEventType, id: ConnectionId) {
        this.mType = tp;
        this.mId = id;
    }
}
export class StatsEvent extends RtcEvent
{
    private mReports: RTCStatsReport[];
    public get Reports(): RTCStatsReport[]
    {
        return this.mReports;
    }

    constructor(id: ConnectionId, reports: RTCStatsReport[]) {
        super(RtcEventType.Stats, id);
        this.mReports = reports;
    }
}

export interface IWebRtcNetwork extends IBasicNetwork {
    GetBufferedAmount(id: ConnectionId, reliable: boolean): number;
    DequeueRtcEvent(): RtcEvent;
}
//export {NetEventType, NetworkEvent, ConnectionId, INetwork, IBasicNetwork};
