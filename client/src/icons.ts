/** Phosphor icons (fill style), bundled as text so they work offline. */
import robotSvg from "@phosphor-icons/core/assets/fill/robot-fill.svg?raw";
import checkSvg from "@phosphor-icons/core/assets/fill/check-circle-fill.svg?raw";
import userSvg from "@phosphor-icons/core/assets/fill/user-fill.svg?raw";
import usersSvg from "@phosphor-icons/core/assets/fill/users-fill.svg?raw";
import logoutSvg from "@phosphor-icons/core/assets/fill/sign-out-fill.svg?raw";
import plusSvg from "@phosphor-icons/core/assets/fill/plus-circle-fill.svg?raw";
import minusSvg from "@phosphor-icons/core/assets/fill/minus-circle-fill.svg?raw";
import linkSvg from "@phosphor-icons/core/assets/fill/link-simple-fill.svg?raw";
import playSvg from "@phosphor-icons/core/assets/fill/play-fill.svg?raw";
import hideSvg from "@phosphor-icons/core/assets/fill/eye-closed-fill.svg?raw";
import searchSvg from "@phosphor-icons/core/assets/fill/magnifying-glass-fill.svg?raw";
import ghostSvg from "@phosphor-icons/core/assets/fill/ghost-fill.svg?raw";
import clockSvg from "@phosphor-icons/core/assets/fill/clock-fill.svg?raw";
import cubeSvg from "@phosphor-icons/core/assets/fill/cube-fill.svg?raw";
import heartSvg from "@phosphor-icons/core/assets/fill/heart-fill.svg?raw";
import handSvg from "@phosphor-icons/core/assets/fill/hand-pointing-fill.svg?raw";
import radarSvg from "@phosphor-icons/core/assets/fill/broadcast-fill.svg?raw";
import megaphoneSvg from "@phosphor-icons/core/assets/fill/megaphone-simple-fill.svg?raw";
import trophySvg from "@phosphor-icons/core/assets/fill/trophy-fill.svg?raw";
import crownSvg from "@phosphor-icons/core/assets/fill/crown-simple-fill.svg?raw";
import swordSvg from "@phosphor-icons/core/assets/fill/sword-fill.svg?raw";
import fistSvg from "@phosphor-icons/core/assets/fill/hand-fist-fill.svg?raw";
import musicSvg from "@phosphor-icons/core/assets/fill/music-notes-fill.svg?raw";
import undoSvg from "@phosphor-icons/core/assets/fill/arrow-u-up-left-fill.svg?raw";
import turnSvg from "@phosphor-icons/core/assets/fill/arrows-clockwise-fill.svg?raw";
import scoresSvg from "@phosphor-icons/core/assets/fill/list-numbers-fill.svg?raw";
import soundSvg from "@phosphor-icons/core/assets/fill/speaker-high-fill.svg?raw";
import muteSvg from "@phosphor-icons/core/assets/fill/speaker-slash-fill.svg?raw";
import moveSvg from "@phosphor-icons/core/assets/fill/arrows-out-cardinal-fill.svg?raw";
import blendSvg from "@phosphor-icons/core/assets/fill/eye-slash-fill.svg?raw";
import offlineSvg from "@phosphor-icons/core/assets/fill/wifi-slash-fill.svg?raw";
import plugSvg from "@phosphor-icons/core/assets/fill/plugs-connected-fill.svg?raw";
import skullSvg from "@phosphor-icons/core/assets/fill/skull-fill.svg?raw";
import binocularsSvg from "@phosphor-icons/core/assets/fill/binoculars-fill.svg?raw";
import shuffleSvg from "@phosphor-icons/core/assets/fill/shuffle-fill.svg?raw";
import waveSvg from "@phosphor-icons/core/assets/fill/hand-waving-fill.svg?raw";
import laughSvg from "@phosphor-icons/core/assets/fill/smiley-fill.svg?raw";
import questionSvg from "@phosphor-icons/core/assets/fill/question-fill.svg?raw";
import partySvg from "@phosphor-icons/core/assets/fill/confetti-fill.svg?raw";
import timerSvg from "@phosphor-icons/core/assets/fill/timer-fill.svg?raw";

const SVG = {
  robot: robotSvg,
  check: checkSvg,
  user: userSvg,
  users: usersSvg,
  logout: logoutSvg,
  plus: plusSvg,
  minus: minusSvg,
  link: linkSvg,
  play: playSvg,
  hide: hideSvg,
  search: searchSvg,
  ghost: ghostSvg,
  clock: clockSvg,
  cube: cubeSvg,
  heart: heartSvg,
  hand: handSvg,
  radar: radarSvg,
  megaphone: megaphoneSvg,
  trophy: trophySvg,
  crown: crownSvg,
  sword: swordSvg,
  fist: fistSvg,
  music: musicSvg,
  undo: undoSvg,
  turn: turnSvg,
  scores: scoresSvg,
  sound: soundSvg,
  mute: muteSvg,
  move: moveSvg,
  blend: blendSvg,
  offline: offlineSvg,
  plug: plugSvg,
  skull: skullSvg,
  binoculars: binocularsSvg,
  wave: waveSvg,
  laugh: laughSvg,
  question: questionSvg,
  party: partySvg,
  timer: timerSvg,
  shuffle: shuffleSvg,
} as const;

export type IconName = keyof typeof SVG;

/** An icon as inline HTML. It takes the text color of where it sits. */
export function icon(name: IconName, size = 18): string {
  return SVG[name].replace("<svg ", `<svg class="ph-icon" width="${size}" height="${size}" aria-hidden="true" `);
}

const images = new Map<IconName, HTMLImageElement>();

/** Draws every icon once (white) so the game canvas can use them as pictures. Call before the game starts. */
export async function loadIconImages(): Promise<void> {
  await Promise.all(
    (Object.keys(SVG) as IconName[]).map(
      (name) =>
        new Promise<void>((resolve) => {
          const svg = SVG[name].replace("<svg ", '<svg width="96" height="96" ').replace("currentColor", "#ffffff");
          const img = new Image(96, 96);
          img.onload = () => {
            images.set(name, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }),
    ),
  );
}

/** Adds the icon pictures to a scene's textures as "ic_<name>" (tint them with setTint). */
export function addIconTextures(scene: { textures: { exists(k: string): boolean; addImage(k: string, i: HTMLImageElement): unknown } }) {
  images.forEach((img, name) => {
    if (!scene.textures.exists(`ic_${name}`)) scene.textures.addImage(`ic_${name}`, img);
  });
}
