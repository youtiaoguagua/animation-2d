import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateSkeleton, exportToSpine } from '../../server/api/generator.js';
import { bakeMotion } from '../../server/api/motion-core.js';
import { bleedAlpha } from '../../server/api/cutter.js';
import { cleanMattePixels } from '../../server/api/matte-cleanup.js';

const project = new URL('../../output/character-punch/',import.meta.url);
const temp = new URL('punch_temp/',project);
const imageDir = new URL('Image/',temp);
await mkdir(imageDir,{recursive:true});
const master = await readFile(new URL('source.png',temp));
const makePart = (name,parent,depth,box,anchor,points) => ({
  name,parent,depth,
  bbox:{x:box[0],y:box[1],width:box[2],height:box[3]},
  pivot:{x:anchor[0]-box[0],y:anchor[1]-box[1]},
  polygon:points.map(([x,y])=>({x,y})),
});
// Rounded, overlapping elbow regions use the original sleeve pixels on both
// layers. Unlike the first continuous mesh, these layers can fold independently.
const parts = [
  makePart('pelvis',null,0,[410,636,193,279],[507,658],[[427,636],[583,636],[589,690],[586,857],[602,876],[602,914],[411,914],[410,881],[425,858]]),
  makePart('torso','pelvis',2,[426,492,166,169],[507,648],[[471,492],[543,492],[566,510],[578,530],[581,552],[576,581],[581,613],[585,640],[570,651],[442,651],[429,638],[434,608],[437,578],[434,551],[438,530],[451,512]]),
  makePart('upper_arm_left','torso',3,[384,509,72,126],[442,534],[[439,509],[450,519],[454,533],[446,554],[434,590],[431,609],[428,622],[420,632],[406,635],[393,628],[386,616],[387,603],[398,567],[412,535],[425,516]]),
  makePart('forearm_left','upper_arm_left',4,[374,587,62,122],[411,609],[[411,587],[425,592],[432,603],[434,615],[425,644],[424,665],[421,684],[414,702],[400,709],[384,700],[376,683],[374,659],[383,630],[388,603],[395,591]]),
  makePart('upper_arm_right','torso',5,[557,509,70,126],[573,534],[[569,509],[583,515],[595,534],[610,570],[622,600],[627,614],[622,627],[610,635],[596,631],[584,617],[578,593],[570,567],[560,543],[557,526],[561,515]]),
  makePart('forearm_right','upper_arm_right',6,[581,587,63,122],[603,609],[[603,587],[617,593],[626,608],[630,631],[640,653],[641,674],[636,693],[626,705],[613,709],[601,701],[594,686],[592,665],[586,642],[581,616],[584,600],[591,591]]),
  makePart('head','torso',7,[304,139,412,377],[507,498],[[304,139],[716,139],[716,478],[648,491],[568,503],[542,506],[534,516],[479,516],[473,504],[430,498],[357,478],[304,465]]),
];
const analysis={units:'pixels',category:'character',imageSize:{width:1024,height:1024},parts};
const cuts=[];
let edgeCorrections=0;
for(const p of parts){
  const b=p.bbox;
  const points=p.polygon.map(q=>`${q.x-b.x},${q.y-b.y}`).join(' ');
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}" viewBox="0 0 ${b.width} ${b.height}"><polygon points="${points}" fill="white"/></svg>`);
  const {data,info}=await sharp(master).extract({left:b.x,top:b.y,width:b.width,height:b.height}).composite([{input:svg,blend:'dest-in'}]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const dest=new URL(`${p.name}.png`,imageDir);
  const cleaned=cleanMattePixels(data,info.width,info.height,[18,238,19],{radius:8,searchRadius:12});
  edgeCorrections+=cleaned.corrected;
  await sharp(bleedAlpha(cleaned.buffer,info.width,info.height,2),{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(fileURLToPath(dest));
  cuts.push({...p,path:fileURLToPath(dest),size:{width:b.width,height:b.height},contour:'polygon'});
}
const skeleton=generateSkeleton(analysis,'3.8',{imageSize:analysis.imageSize,skin:false});
const motion=JSON.parse(await readFile(new URL('motion.json',import.meta.url),'utf8'));
const baked=bakeMotion(motion,skeleton,{imageSize:analysis.imageSize,name:'punch'});
if(baked.warnings.length) throw new Error(baked.warnings.join('\n'));
skeleton.animations={punch:baked.animation};
const exported=await exportToSpine(skeleton,fileURLToPath(new URL('punch/',project)),'punch',{target:'cocos-3.8',cutResults:cuts,skipSpineProject:true});
const manifest=JSON.parse(await readFile(new URL('manifest.json',temp),'utf8'));
manifest.createdAt=new Date().toISOString();
manifest.bones=skeleton.bones.length; manifest.slots=skeleton.slots.length; manifest.partCount=parts.length;
manifest.segmentation={requested:'polygon',backend:'polygon',samParts:[],polygonParts:parts.map(p=>p.name),jointOverlap:true};
manifest.animations=[{name:'punch',duration:motion.duration}];
manifest.warnings=[];
manifest.transparency.partEdgeCorrections=edgeCorrections;
const state={skeleton,imageSize:analysis.imageSize,category:'character',analysis:{parts},alignment:[],imageUrls:parts.map(p=>[p.name,`/output/character-punch/punch_temp/Image/${p.name}.png`]),sourceUrl:manifest.sourceUrl};
await writeFile(new URL('preview.json',temp),JSON.stringify(state));
await writeFile(new URL('manifest.json',temp),JSON.stringify(manifest,null,2));
await writeFile(new URL('analysis.plan.json',temp),JSON.stringify(analysis,null,2));
await writeFile(new URL('motion.plan.json',temp),JSON.stringify(motion,null,2));
await writeFile(new URL('analysis.json',import.meta.url),JSON.stringify(analysis,null,2));
console.log({exportDirectory:exported.projectDir,bones:skeleton.bones.length,slots:skeleton.slots.length,duration:motion.duration,edgeCorrections,warnings:manifest.warnings});
