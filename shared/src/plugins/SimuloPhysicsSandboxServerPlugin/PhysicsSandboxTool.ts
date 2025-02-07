import type PhysicsSandboxPlayer from "./PhysicsSandboxPlayer";
import type SimuloPhysicsSandboxServerPlugin from ".";

export default interface PhysicsSandboxTool {
    name: string;
    description: string;
    icon: string;
    /** Ask for this in constructor. */
    physicsSandbox: SimuloPhysicsSandboxServerPlugin;
    /** When player presses down primary input with this tool selected */
    playerDown(player: PhysicsSandboxPlayer): void;
    /** When player moves with this tool selected, regardless of primary input. You should usually check if player.down is true before doing anything. */
    playerMove(player: PhysicsSandboxPlayer): void;
    /** When player releases primary input with this tool selected, or when they switch tools or leave the room while holding down primary input */
    playerUp(player: PhysicsSandboxPlayer): void;
    /** Fires on world update.
     * 
     * If your tool renders custom overlays on screen, you should re-add them each time with `physicsSandbox.addOverlayShape` and `physicsSandbox.addOverlayText`. We server-side render tools, and those overlays will be sent to all clients. */
    update(player: PhysicsSandboxPlayer): void;
}