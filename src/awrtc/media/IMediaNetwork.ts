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
import { ConnectionId, IWebRtcNetwork } from "../network/index";
import { MediaConfig } from "./MediaConfig";
import { IFrameData } from "./RawFrame";

export enum MediaConfigurationState {
    Invalid = 0,
    NoConfiguration = 1,
    InProgress = 2,
    Successful = 3,
    Failed = 4
}

export enum MediaEventType
{
    Invalid = 0,

    StreamAdded = 20
}

/**
 * Will replace frame event / configuration system in the future.
 * 
 * So far it only delivers HTMLVideoElements once connection and
 * all tracks are ready and it plays.
 * 
 * This is all temporary and will be updated soon to handle
 * all events from configuration of local streams to frame updates and
 * renegotation.
 * 
 */
export class MediaEvent
{
    private mEventType = MediaEventType.Invalid;
    public get EventType()
    {
        return this.mEventType;
    }

    private mConnectionId = ConnectionId.INVALID;
    public get ConnectionId()
    {
        return this.mConnectionId;
    }


    private mArgs:any; 
    public get Args():any
    {
        return this.mArgs;
    }

    public constructor(type:MediaEventType, id: ConnectionId, args:any)
    {
        this.mEventType = type;
        this.mConnectionId = id;
        this.mArgs = args;
    }
}
/**Interface adds media functionality to IWebRtcNetwork.
 * It is used to ensure compatibility to all other platforms.
 */
export interface IMediaNetwork extends IWebRtcNetwork
{
    Configure(config: MediaConfig): void;
    GetConfigurationState(): MediaConfigurationState;
    GetConfigurationError(): string;
    ResetConfiguration(): void;

    TryGetFrame(id: ConnectionId): IFrameData;
    PeekFrame(id: ConnectionId): IFrameData;
    SetVolume(volume: number, id: ConnectionId): void;
    HasAudioTrack(id: ConnectionId): boolean;
    HasVideoTrack(id: ConnectionId): boolean;

    //Only used for browser specific events for now
    //Not part of the C# api yet.
    DequeueMediaEvent(): MediaEvent;
}