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
import { AWebRtcCall } from "../media/AWebRtcCall";
import { NetworkConfig } from "../media/NetworkConfig";
import { IMediaNetwork } from "../media/IMediaNetwork";
import { BrowserMediaNetwork } from "./BrowserMediaNetwork";

/**Browser version of the C# version of WebRtcCall. 
 * 
 * See ICall interface for detailed documentation. 
 * BrowserWebRtcCall mainly exists to allow other versions 
 * in the future that might build on a different IMediaNetwork
 * interface (Maybe something running inside Webassembly?).
 */
export class BrowserWebRtcCall extends AWebRtcCall {
    public constructor(config: NetworkConfig) {
        super(config);
        this.Initialize(this.CreateNetwork());
    }

    private CreateNetwork(): IMediaNetwork {

        return new BrowserMediaNetwork(this.mNetworkConfig);
    }
    protected DisposeInternal(disposing: boolean): void {
        super.DisposeInternal(disposing);
        if (disposing) {
            if (this.mNetwork != null)
                this.mNetwork.Dispose();
            this.mNetwork = null;
        }
    }
}