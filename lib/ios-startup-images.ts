/** iOS reads launch screens for home-screen web apps only from `apple-touch-startup-image` links whose
 *  `media` query matches the device exactly (CSS width/height, pixel ratio, orientation). One entry per
 *  device class, both orientations. Pixel sizes = CSS size × ratio. Generated files live in /public/splash/ios. */
export type StartupDevice={width:number;height:number;ratio:2|3;devices:string};
export const iosStartupDevices:StartupDevice[]=[
 {width:440,height:956,ratio:3,devices:'iPhone 17 Pro Max, 16 Pro Max'},
 {width:420,height:912,ratio:3,devices:'iPhone Air'},
 {width:402,height:874,ratio:3,devices:'iPhone 17, 17 Pro, 16 Pro'},
 {width:430,height:932,ratio:3,devices:'iPhone 16 Plus, 15 Plus, 15 Pro Max, 14 Pro Max'},
 {width:393,height:852,ratio:3,devices:'iPhone 16, 16e, 15, 15 Pro, 14 Pro'},
 {width:428,height:926,ratio:3,devices:'iPhone 14 Plus, 13 Pro Max, 12 Pro Max'},
 {width:390,height:844,ratio:3,devices:'iPhone 14, 13, 13 Pro, 12, 12 Pro'},
 {width:375,height:812,ratio:3,devices:'iPhone 13 mini, 12 mini, 11 Pro, XS, X'},
 {width:414,height:896,ratio:3,devices:'iPhone 11 Pro Max, XS Max'},
 {width:414,height:896,ratio:2,devices:'iPhone 11, XR'},
 {width:414,height:736,ratio:3,devices:'iPhone 8 Plus, 7 Plus'},
 {width:375,height:667,ratio:2,devices:'iPhone SE (2nd/3rd gen), 8, 7'},
 {width:1024,height:1366,ratio:2,devices:'iPad Pro 12.9"'},
 {width:1032,height:1376,ratio:2,devices:'iPad Pro 13" (M4)'},
 {width:834,height:1194,ratio:2,devices:'iPad Pro 11", iPad Air 11"'},
 {width:834,height:1210,ratio:2,devices:'iPad Pro 11" (M4)'},
 {width:820,height:1180,ratio:2,devices:'iPad Air 10.9", iPad 10th gen'},
 {width:810,height:1080,ratio:2,devices:'iPad 10.2"'},
 {width:834,height:1112,ratio:2,devices:'iPad Pro 10.5", iPad Air 3'},
 {width:768,height:1024,ratio:2,devices:'iPad 9.7", iPad mini 5'},
 {width:744,height:1133,ratio:2,devices:'iPad mini 6/7'},
];
export function startupImageFile(d:StartupDevice,orientation:'portrait'|'landscape'){
 const w=orientation==='portrait'?d.width:d.height,h=orientation==='portrait'?d.height:d.width;
 return `/splash/ios/${w*d.ratio}x${h*d.ratio}.png`;
}
/** Same shape as pwa-asset-generator's output (no `screen and` prefix), the form most widely verified on real iPhones. */
export function startupImageMedia(d:StartupDevice,orientation:'portrait'|'landscape'){
 return `(device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: ${orientation})`;
}
/** `appleWebApp.startupImage` entries for Next metadata: every device, both orientations. */
export function iosStartupImages(){
 return iosStartupDevices.flatMap(d=>(['portrait','landscape'] as const).map(o=>({url:startupImageFile(d,o),media:startupImageMedia(d,o)})));
}
