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
import { ConnectionId } from "../network/index";
import { IFrameData } from "./RawFrame";


export interface CallEventHandler {
    (sender: any, args: CallEventArgs): void;
}

/// <summary>
/// Type of the event.
/// </summary>
export enum CallEventType {
    /// <summary>
    /// Used if the event value wasn't initialized
    /// </summary>
    Invalid = 0,

    /// <summary>
    /// The call object is successfully connected to the server waiting for another user 
    /// to connect.
    /// </summary>
    WaitForIncomingCall = 1,

    /// <summary>
    /// A call was accepted
    /// </summary>
    CallAccepted = 2,

    /// <summary>
    /// The call ended
    /// </summary>
    CallEnded = 3,

    /**
     * Backwards compatibility. Use MediaUpdate
     */
    FrameUpdate = 4,

    /// <summary>
    /// Text message arrived
    /// </summary>
    Message = 5,

    /// <summary>
    /// Connection failed. Might be due to an server, network error or the address didn't exist
    /// Using ErrorEventArgs
    /// </summary>
    ConnectionFailed = 6,

    /// <summary>
    /// Listening failed. Address might be in use or due to server/network error
    /// Using ErrorEventArgs
    /// </summary>
    ListeningFailed = 7,


    /// <summary>
    /// Event triggered after the local media was successfully configured. 
    /// If requested the call object will have access to the users camera and/or audio now and
    /// the local camera frames can be received in events. 
    /// </summary>
    ConfigurationComplete = 8,

    /// <summary>
    /// Configuration failed. This happens if the configuration requested features
    /// the system doesn't support e.g. no camera, camera doesn't support the requested resolution
    /// or the user didn't allow the website to access the camera/microphone in WebGL mode.
    /// </summary>
    ConfigurationFailed = 9,


    
    /// <summary>
    /// Reliable or unreliable data msg arrived
    /// </summary>
    DataMessage = 10,


    /** 
     * 
     */
    MediaUpdate = 20,
}
export class CallEventArgs {

    private mType = CallEventType.Invalid;
    public get Type(): CallEventType {
        return this.mType;
    }

    public constructor(type: CallEventType) {
        this.mType = type;
    }
}

export class CallAcceptedEventArgs extends CallEventArgs
{
    private mConnectionId: ConnectionId = ConnectionId.INVALID;
    public get ConnectionId(): ConnectionId {
        return this.mConnectionId;
    }

    public constructor(connectionId: ConnectionId) {
        super(CallEventType.CallAccepted);
        this.mConnectionId = connectionId;
    }
}
export class CallEndedEventArgs extends CallEventArgs {
    private mConnectionId: ConnectionId = ConnectionId.INVALID;
    public get ConnectionId(): ConnectionId{
        return this.mConnectionId;
    }

    public constructor(connectionId: ConnectionId) {
        super(CallEventType.CallEnded);
        this.mConnectionId = connectionId;
    }
}

export enum CallErrorType {
    Unknown
}

export class ErrorEventArgs extends CallEventArgs {
    private mErrorMessage: string;
    public get ErrorMessage(): string {
        return this.mErrorMessage;
    }

    private mErrorType: CallErrorType = CallErrorType.Unknown;
    public get ErrorType(): CallErrorType {
        return this.mErrorType;
    }

    public constructor(eventType: CallEventType, type?: CallErrorType, errorMessage?: string) {
        super(eventType);
        this.mErrorType = type;
        this.mErrorMessage = errorMessage;

        if (this.mErrorMessage == null) {
            switch (eventType) {
                //use some generic error messages as the underlaying system doesn't report the errors yet.
                case CallEventType.ConnectionFailed:
                    this.mErrorMessage = "Connection failed.";
                    break;
                case CallEventType.ListeningFailed:
                    this.mErrorMessage = "Failed to allow incoming connections. Address already in use or server connection failed.";
                    break;
                default:
                    this.mErrorMessage = "Unknown error.";
                    break;

            }
        }
    }
}

export class WaitForIncomingCallEventArgs extends CallEventArgs
{
    private mAddress: string;
    public get Address(): string {
        return this.mAddress;
    }
    
    public constructor(address: string) {
        super(CallEventType.WaitForIncomingCall);
        this.mAddress = address;
    }
}


export class MessageEventArgs extends CallEventArgs {

    private mConnectionId: ConnectionId = ConnectionId.INVALID;
    public get ConnectionId(): ConnectionId {
        return this.mConnectionId;
    }
    private mContent: string;
    public get Content(): string {
        return this.mContent;
    }
    private mReliable: boolean;
    public get Reliable(): boolean {
        return this.mReliable;
    }

    public constructor(id: ConnectionId, message: string, reliable: boolean) {
        super(CallEventType.Message);
        this.mConnectionId = id;
        this.mContent = message;
        this.mReliable = reliable;
    }
}


export class DataMessageEventArgs extends CallEventArgs {

    private mConnectionId: ConnectionId = ConnectionId.INVALID;
    public get ConnectionId(): ConnectionId {
        return this.mConnectionId;
    }
    private mContent: Uint8Array;
    public get Content(): Uint8Array {
        return this.mContent;
    }
    private mReliable: boolean;
    public get Reliable(): boolean {
        return this.mReliable;
    }

    public constructor(id: ConnectionId, message: Uint8Array, reliable: boolean) {
        super(CallEventType.DataMessage);
        this.mConnectionId = id;
        this.mContent = message;
        this.mReliable = reliable;
    }
}

/**
 * Replaces the FrameUpdateEventArgs. Instead of
 * giving access to video frames only this gives access to
 * video html tag once it is created.
 * TODO: Add audio + video tracks + flag that indicates added, updated or removed
 * after renegotiation is added.
 */
export class MediaUpdatedEventArgs extends CallEventArgs
{
    private mConnectionId: ConnectionId = ConnectionId.INVALID;
    public get ConnectionId(): ConnectionId {
        return this.mConnectionId;
    }
    /// <summary>
    /// False if the frame is from a local camera. True if it is received from
    /// via network.
    /// </summary>
    public get IsRemote(): boolean {
        return this.mConnectionId.id != ConnectionId.INVALID.id;
    }

    private mVideoElement:HTMLVideoElement;
    public get VideoElement():HTMLVideoElement
    {
        return this.mVideoElement;
    }
    public constructor(conId: ConnectionId, videoElement:HTMLVideoElement)
    {
        super(CallEventType.MediaUpdate);
        this.mConnectionId = conId;
        this.mVideoElement = videoElement;
    }
}

/// <summary>
/// Will be replaced with MediaUpdatedEventArgs.
/// It doesn't make a lot of sense in HTML only
/// </summary>
export class FrameUpdateEventArgs extends CallEventArgs {

    private mFrame: IFrameData;

    /// <summary>
    /// Raw image data. Note that the byte array contained in RawFrame will be reused
    /// for the next frames received. Only valid until the next call of ICall.Update
    /// </summary>
    public get Frame(): IFrameData {
        return this.mFrame;
    }

    private mConnectionId: ConnectionId = ConnectionId.INVALID;
    public get ConnectionId(): ConnectionId {
        return this.mConnectionId;
    }
    /// <summary>
    /// False if the frame is from a local camera. True if it is received from
    /// via network.
    /// </summary>
    public get IsRemote(): boolean {
        return this.mConnectionId.id != ConnectionId.INVALID.id;
    }

    /// <summary>
    /// Constructor
    /// </summary>
    /// <param name="conId"></param>
    /// <param name="frame"></param>
    public constructor(conId: ConnectionId, frame: IFrameData)
    {
        super(CallEventType.FrameUpdate);
        this.mConnectionId = conId;
        this.mFrame = frame;
    }


}