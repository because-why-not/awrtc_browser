import { SLog } from "../network/index";
import { AutoplayResolver } from "./AutoplayResolver";

//Adds a UI to the page to test audio processing
const AUDIO_PROCESSING_TEST_UI = false;
/**AudioProcessor can be used to process remote audio before playback. 
 * Under normal conditions it is suppose to insert itself in-between
 * the received remote AudioTrack and create a new output audio track.
 * 
 */
export class AudioProcessor {
    //
    //
    /**for this workaround we do continue using the HTMLVideoElement with original video
     * and original audio but mute the audio.
     * The actual audio output is done via an AudioContext.
     * For other browsers we forward audio to a new AudioTrack and then replace the original. 
     * 
     */
    public static readonly AUDIO_PROCESSING_CHROME_WORKAROUND = true;
    
    public audioCtx: AudioContext;
    public source: MediaStreamAudioSourceNode;
    public panNode: StereoPannerNode;
    public panningControl: HTMLInputElement = null;
    public gainNode: GainNode;
    
    constructor() {
        this.audioCtx = new AudioContext();

        const contextRef = this.audioCtx;
        this.audioCtx.onstatechange = () => {
            //watch out this triggers after disposal and this.audioCtx is null
            SLog.L("AudioContext state changed to ", contextRef.state);
        }
        this.gainNode = new GainNode( this.audioCtx);
        this.panNode = new StereoPannerNode(this.audioCtx);
        if (AUDIO_PROCESSING_TEST_UI)
        {
            this.panningControl = this.CreatePanningControl();
        
            // changes panning based on ui
            this.panningControl.oninput = () => {
                this.panNode.pan.value = Number(this.panningControl.value);
            };
        }
        console.warn("AudioProcessor constructed in state ", this.audioCtx.state);

        if (this.audioCtx.state == "suspended") {
            SLog.L("Audio context was created as suspended.");
            this.RequestAutoplayFix();
        }
    }

    public Dispose() {

        if(this.panningControl)
            this.panningControl.remove();
        this.audioCtx.close();
        this.audioCtx = null;
    }

    
    private CreatePanningControl() {
        // Create the input element
        const input = document.createElement('input') as HTMLInputElement;

        // Set attributes
        input.className = 'panning-control';
        input.type = 'range';
        input.min = '-1';
        input.max = '1';
        input.step = '0.1';
        input.value = '0';

        // Append the input to the body or any other desired parent element
        document.body.appendChild(input); // Change 'document.body' if you want to append to another element
        return input;
    }

    public SetVolumePan(volume: number, pan: number) {
        this.gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
        this.panNode.pan.value = Number(pan);
    }

    
    private RequestAutoplayFix() {
        AutoplayResolver.RequestAutoplayFix(this);
    }

    public ResolveAutoplay() {
        if (this.audioCtx)
        {
            SLog.L("Attempting to resume audio context.");
            this.audioCtx.resume().then(() => {
                SLog.L("AudioContext resumed successfully.");
                AutoplayResolver.RemoveCompleted(this);
            }).catch((error) => {
                SLog.LW("AudioContext failed to resume:", error);
            });
        } else {
            SLog.L("ResolveAutoplay called after disposal.");
        }
    }
    
    public InjectPanner(instream) {
            
        this.source = this.audioCtx.createMediaStreamSource(instream);
        
        

        //moves audio from input stream to the panner
        this.source.connect(this.gainNode);
        this.gainNode.connect(this.panNode);

        //for testing outputs panner audio directly
        //this.panNode.connect(this.audioCtx.destination);
        


        if (AudioProcessor.AUDIO_PROCESSING_CHROME_WORKAROUND) {
            //for workaround we output directly and instead attach the unprocessed track to the video element
            //which we later silence.
            this.panNode.connect(this.audioCtx.destination);
            return instream;
        } else {
            // stream destination to convert back to a MediaStream
            const mediaStreamDestination = this.audioCtx.createMediaStreamDestination();
            this.panNode.connect(mediaStreamDestination);
            //Create a new stream that adds our video track back in as well
            const stream = new MediaStream();
            stream.addTrack(mediaStreamDestination.stream.getAudioTracks()[0]);
            if (instream.getVideoTracks().length > 0)
                stream.addTrack(instream.getVideoTracks()[0]);
    
            //return track should work the same as our input track but with panning applied
            return stream;
        }
    }
}