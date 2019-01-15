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

/// <summary>
/// Configuration for the WebRtcCall class.
/// 
/// Allows to turn on / off video and audio + configure the used servers to initialize the connection and
/// avoid firewalls.
/// </summary>
export class MediaConfig {
    private mAudio: boolean = true;
    public get Audio(): boolean {
        return this.mAudio;
    }
    public set Audio(value: boolean) {
        this.mAudio = value;
    }

    private mVideo: boolean = true;
    public get Video(): boolean {
        return this.mVideo;
    }
    public set Video(value: boolean) {
        this.mVideo = value;
    }
    

    private mVideoDeviceName : string = "";
    public get VideoDeviceName(): string {
        return this.mVideoDeviceName;
    }
    public set VideoDeviceName(value: string) {
        this.mVideoDeviceName = value;
    }

    private mMinWidth = -1;
    public get MinWidth(): number {
        return this.mMinWidth;
    }
    public set MinWidth(value: number) {
        this.mMinWidth = value;
    }

    private mMinHeight = -1;
    public get MinHeight(): number {
        return this.mMinHeight;
    }
    public set MinHeight(value: number) {
        this.mMinHeight = value;
    }

    private mMaxWidth = -1;
    public get MaxWidth(): number {
        return this.mMaxWidth;
    }
    public set MaxWidth(value: number) {
        this.mMaxWidth = value;
    }
    private mMaxHeight = -1;
    public get MaxHeight(): number {
        return this.mMaxHeight;
    }
    public set MaxHeight(value: number) {
        this.mMaxHeight = value;
    }

    private mIdealWidth = -1;
    public get IdealWidth(): number {
        return this.mIdealWidth;
    }
    public set IdealWidth(value: number) {
        this.mIdealWidth = value;
    }

    private mIdealHeight = -1;
    public get IdealHeight(): number {
        return this.mIdealHeight;
    }
    public set IdealHeight(value: number) {
        this.mIdealHeight = value;
    }

    
    private mMinFps = -1;
    public get MinFps(): number {
        return this.mMinFps;
    }
    public set MinFps(value: number) {
        this.mMinFps = value;
    }
    
    private mMaxFps = -1;
    public get MaxFps(): number {
        return this.mMaxFps;
    }
    public set MaxFps(value: number) {
        this.mMaxFps = value;
    }
    
    private mIdealFps = -1;
    public get IdealFps(): number {
        return this.mIdealFps;
    }
    public set IdealFps(value: number) {
        this.mIdealFps = value;
    }

    private mFrameUpdates = false;

    /** false - frame updates aren't generated. Useful for browser mode
     *  true  - library will deliver frames as ByteArray
    */
    public get FrameUpdates(): boolean {
        return this.mFrameUpdates;
    }
    public set FrameUpdates(value: boolean) {
        this.mFrameUpdates = value;
    }
}