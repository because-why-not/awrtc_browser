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
import { CallEventHandler } from "./CallEventArgs";
import { ConnectionId } from "../network/index";
import { MediaConfig } from "./MediaConfig";

/**
 * This interface closely mirrors the C# ICall interface and follows a specific usage pattern:
 * 1. Create an instance using a specific NetworkConfig e.g. new BrowserWebRtcCall(nconfig)
 * 2. Register an event handler at CallEvent and regularly call Update (30-60 times per second for real-time applications).
 * 3. Call Configure with a MediaConfig instance to define required features.
 * 4. Wait for a ConfigurationComplete (or failed) event, during which the user may grant device access permissions.
 * 5. Initiate a call using Listen (for incoming connections) or Call (to connect to a listening ICall).
 * 6. Once CallAccepted and other events are received, the call is active. You can send messages, adjust volume, etc.
 * 7. After the call, ensure to call Dispose to prevent background resource usage.
 * 
 * Refer to example apps and guides for detailed usage instructions.
 */
export interface ICall {
    addEventListener(listener: CallEventHandler): void;
    removeEventListener(listener: CallEventHandler): void;

    Call(address: string): void;
    Configure(config: MediaConfig): void;
    Listen(address: string): void;
    Send(message: string, reliable?: boolean, id?: ConnectionId): void
    SendData(message: Uint8Array, reliable: boolean, id: ConnectionId): void
    Update(): void;
    Dispose(): void;
    HasAudioTrack(remoteUserId: ConnectionId): boolean;
    HasVideoTrack(remoteUserId: ConnectionId): boolean;
}