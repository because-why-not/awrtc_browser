import { SLog } from "../network/Helper";

export interface AutoplayResolvable {

    ResolveAutoplay();
}

/**
 * AutoplayResolver is used to detect instances of blocked playback due to the browsers autoplay protection
 * e.g. a typical scenario when this happens is:
 * 1. You load the webpage
 * 2. The user interacts with the webpage to wait for an incoming call (without themselves sending audio)
 * 3. The user then receives an incoming call
 * 4. The system will attempt to show the received video feed. However, the browser will block the playback
 * because the user hasn't played any audio themselves yet.
 * 
 * In this situation the event onautoplayblocked will trigger. The user must then interact with the UI
 * e.g. a button and during the event handler AutoplayResolver.Resolve must be called. The browser
 * detects that this interaction comes from the user and then allows all blocked elements to play.
 * 
 * In case of the Unity plugin a click / touch event handler is registered with unity's WebGL canvas
 * and once the user interacts with it, it is automatically resolved. 
 * 
 */
export class AutoplayResolver {


    /**Register an event handler here to detect when a stream gets blocked from playback
     * AutoplayResolver.Resolve() must then be called via an event handler to ensure
     * the browser detects the user allowed playback.
     */
    public static onautoplayblocked: () => void = () => {
        SLog.LW("Playback of a media stream was blocked. Set an event handler to "
        + "AutoplayResolver.onautoplayblocked to allow the user to start playback.");
    }

    private static sBlockedStreams: Set<AutoplayResolvable> = new Set();
    public static HasCompleted(): boolean {
        return AutoplayResolver.sBlockedStreams.size == 0;
    }

    //This will record a reference to the given object and call onautoplayblocked
    public static RequestAutoplayFix(res: AutoplayResolvable) {

        AutoplayResolver.sBlockedStreams.add(res);

        //call handler to request user interaction
        if (AutoplayResolver.onautoplayblocked !== null) {
            AutoplayResolver.onautoplayblocked();
        }
    }

    //Call this from a user event handler to try play video elements / resume audio contexts
    public static Resolve() {
        SLog.L("ResolveAutoplay. Trying to restart video / turn on audio after user interaction ");

        let streams = AutoplayResolver.sBlockedStreams;
        for (let v of Array.from(streams)) {
            try {
                v.ResolveAutoplay();
            } catch (ex) {
                SLog.LE("AutoplayResolver.Resolve failed: " + ex);
                //remove to avoid running into the error repeatedly
                this.Remove(v);
            }
        }
    }

    //call when autoplay issue was resolved. can be called multiple times without error
    public static RemoveCompleted(res: AutoplayResolvable): void {
        AutoplayResolver.sBlockedStreams.delete(res);
    }

    //Call when stream is disposed. can be called multiple times without error
    public static Remove(res: AutoplayResolvable): void {
        AutoplayResolver.sBlockedStreams.delete(res);
    }
}