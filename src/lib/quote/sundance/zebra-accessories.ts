const somfy = ['Somfy Sonesse Ultra 30 WireFree RTS Li-ion', 'Somfy Sonesse 30 RTS 24V DC'];
const alpha = ['Alpha Motor 30 2Nm Li-ion', 'Alpha Motor 30 3Nm Li-ion', 'Alpha Motor 40 5Nm Li-ion'];
const simphony = ['Simphony Motor 2Nm Li-ion'];
const radio = [...somfy, ...alpha, ...simphony];
export const sundanceZebraAccessories = [
  { key:'somfy_charger',label:'Somfy Li-ion charger V2, 13-foot cable',net:36,page:10,controls:[somfy[0]] },
  { key:'somfy_power',label:'Somfy 24V DC power supply, 6-foot cord',net:50,page:10,controls:[somfy[1]] },
  { key:'somfy_solar',label:'Somfy WireFree charging solar panel kit',net:110,page:10,controls:[somfy[0]] },
  { key:'situo_1',label:'Situo 1-Channel',net:66,page:11,controls:somfy },
  { key:'situo_5',label:'Situo 5-Channel',net:83,page:11,controls:somfy },
  { key:'telis_16',label:'Telis 16-Channel',net:290,page:11,controls:somfy },
  { key:'situo_variation',label:'Situo 5-Variation',net:154,page:11,controls:somfy },
  { key:'decoflex_1',label:'Decoflex WireFree 1-Channel wall switch',net:171,page:11,controls:somfy },
  { key:'decoflex_5',label:'Decoflex WireFree 5-Channel wall switch',net:182,page:11,controls:somfy },
  { key:'smoove_1',label:'Smoove 1-Channel wall switch',net:80,page:11,controls:somfy },
  { key:'smoove_multi',label:'Smoove multi-channel wall switch (table: 5; image: 4)',net:100,page:11,controls:somfy,review:'Confirm the exact Smoove switch: the source table says 5-channel but its image says 4-channel.' },
  { key:'tahoma',label:'TaHoma Switch',net:260,page:11,controls:somfy },
  { key:'tahoma_ethernet',label:'TaHoma Switch Ethernet Adapter',net:22,page:11,controls:somfy },
  { key:'alpha_charger',label:'Alpha Li-ion charger, 13-foot cord',net:28,page:12,controls:alpha },
  { key:'alpha_battery',label:'Alpha rechargeable external battery pack',net:50,page:12,controls:alpha },
  { key:'alpha_remote_1',label:'Alpha 1-Channel remote',net:33,page:12,controls:alpha },
  { key:'alpha_remote_5',label:'Alpha 5-Channel remote',net:55,page:12,controls:alpha },
  { key:'alpha_remote_16',label:'Alpha 16-Channel remote',net:110,page:12,controls:alpha },
  { key:'alpha_wall_8',label:'Alpha 8-Channel wall switch',net:100,page:12,controls:alpha },
  { key:'alpha_hub',label:'Alpha Neo Hub Interface',net:300,page:12,controls:alpha },
  { key:'simphony_charger',label:'Simphony Li-ion charger, 12-foot cord',net:25,page:13,controls:simphony },
  { key:'simphony_solar',label:'Simphony WireFree charging solar panel kit',net:75,page:13,controls:simphony },
  { key:'simphony_remote',label:'Simphony 15-Channel remote',net:90,page:13,controls:simphony },
  { key:'simphony_wall',label:'Simphony 6-Channel wall switch',net:75,page:13,controls:simphony },
  { key:'simphony_hub',label:'Simphony Hub/Interface',net:125,page:13,controls:simphony },
  { key:'quiet_charger',label:'Quiet Touch Li-ion charger, 9-foot cord',net:35,page:14,controls:['Quiet Touch Wand'] },
  { key:'bond_bridge',label:'Bond Bridge (compatibility unverified)',net:192,page:14,controls:radio,review:'Bond radio protocol and selected motor compatibility require confirmation. The generic RF description does not establish compatibility.' },
  { key:'bond_sidekick',label:'Sidekick for Shades Gen 2 (compatibility unverified)',net:130,page:14,controls:radio,review:'Sidekick for Shades Gen 2 compatibility and required bridge pairing must be verified for this motor.' },
];
export function sundanceZebraAccessoryKey(key:string) { return `sundance_zebra_accessory_${key}_qty`; }
export function clearSundanceZebraAccessories(options:Record<string,unknown>) { return Object.fromEntries(Object.entries(options).filter(([key])=>!key.startsWith('sundance_zebra_accessory_'))); }
export function sundanceZebraAccessoryIssues(options:Record<string,unknown>) {
  const issues:{page:number;explanation:string}[]=[];
  for(const accessory of sundanceZebraAccessories) {
    const raw=options[sundanceZebraAccessoryKey(accessory.key)]; if(raw==null||raw==='')continue;
    const quantity=Number(raw);
    if(!Number.isSafeInteger(quantity)||quantity<0)issues.push({page:accessory.page,explanation:`${accessory.label} quantity must be a nonnegative whole number.`});
    else if(quantity>0&&!accessory.controls.includes(String(options.sundance_zebra_control)))issues.push({page:accessory.page,explanation:`${accessory.label} is not documented for the selected motor or power voltage.`});
    else if(quantity>0&&accessory.review)issues.push({page:accessory.page,explanation:accessory.review});
  }
  return issues;
}
export function sundanceZebraAccessoryEvidence(options:Record<string,unknown>) {
  return sundanceZebraAccessories.flatMap(accessory=>{
    const quantity=Number(options[sundanceZebraAccessoryKey(accessory.key)]??0);
    return Number.isSafeInteger(quantity)&&quantity>0&&accessory.controls.includes(String(options.sundance_zebra_control))
      ? [{label:`${accessory.label} × ${quantity}`,net:accessory.net*quantity,page:accessory.page}]:[];
  });
}
