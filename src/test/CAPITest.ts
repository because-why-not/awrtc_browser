import { BrowserMediaNetwork, CAPI_MediaNetwork_Create, CAPI_WebRtcNetwork_Create, CAPI_WebRtcNetwork_Release, gCAPI_WebRtcNetwork_Instances, Media, NetworkConfig } from "../awrtc/index";

export function CAPITest_export()
{

}


describe("CAPITest", () => {
    
    beforeEach((done)=>{
        Media.ResetSharedInstance();
        
        done();

    });

    it("CAPI_WebRtcNetwork_Create", () => {

        const in_json = '{"IceServers":[{"urls":["turn.y-not.app:12345"],"credential":"testpass","username":"testuser"}],"SignalingUrl":"ws://s.y-not.app","IsConference":true,"MaxIceRestart":2,"KeepSignalingAlive":true}';

        let lIndex = CAPI_WebRtcNetwork_Create(in_json);
        expect(lIndex).toBeGreaterThan(-1);
        const created_network = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
        expect(created_network).toBeTruthy();


        const out_config = created_network.NetworkConfig;
        //we expect the config to be equal but ignore SignalingNetwork as this might be changed on runtime
        out_config.SignalingNetwork = null;

        //compare the two NetworkConfig as the json formatting will be different
        const in_config = new NetworkConfig();
        in_config.FromJson(in_json);
        const isEqual = in_config.IsEqual(out_config);
        expect(isEqual).toBe(true);

        CAPI_WebRtcNetwork_Release(lIndex);
        expect(gCAPI_WebRtcNetwork_Instances[lIndex]).not.toBeTruthy();

    });
    it("CAPI_MediaNetwork_Create", () => {

        const in_json = '{"IceServers":[{"urls":["turn.y-not.app:12345"],"credential":"testpass","username":"testuser"}],"SignalingUrl":"ws://s.y-not.app","IsConference":true,"MaxIceRestart":2,"KeepSignalingAlive":true}';

        let lIndex = CAPI_MediaNetwork_Create(in_json);
        expect(lIndex).toBeGreaterThan(-1);
        const created_network = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
        expect(created_network).toBeTruthy();


        const out_config = created_network.NetworkConfig;
        //we expect the config to be equal but ignore SignalingNetwork as this might be changed on runtime
        out_config.SignalingNetwork = null;

        //compare the two NetworkConfig as the json formatting will be different
        const in_config = new NetworkConfig();
        in_config.FromJson(in_json);
        const isEqual = in_config.IsEqual(out_config);
        expect(isEqual).toBe(true);

        CAPI_WebRtcNetwork_Release(lIndex);
        expect(gCAPI_WebRtcNetwork_Instances[lIndex]).not.toBeTruthy();

    });
 });