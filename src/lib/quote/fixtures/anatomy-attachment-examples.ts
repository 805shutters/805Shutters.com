/** Synthetic visual regression cases. No customer records or provider actions. */
const base = ['Material: Poly Composite', 'Color: 101_White', 'Hinge Color: Match', 'Louver Size: 3 1/2"', 'Shutter Type: Regular', 'Frame Type: VZ Small', 'Frame Sides: 4', 'Mount: IM'];
export const anatomyAttachmentExamples = [
  {id:'reported',label:'Reported shutter configuration',product:'Onyx Shutters',options:[...base,'Panel Config: R','Tilt Type: H3 - Hidden Tiltrod In Stile']},
  {id:'two-panel',label:'Two panels and hidden tilt',product:'Onyx Shutters',options:[...base,'Panel Config: LR','Tilt Type: Hidden Tilt','Split Tilt: No','Divider Rail: No','Astragal: Right']},
  {id:'front-tilt',label:'Front tilt and divider detail',product:'Norman Shutters',options:[...base,'Panel Config: LR','Tilt Type: Standard Tilt','Split Tilt: No','Divider Rail: Yes']},
  {id:'long',label:'Long descriptions',product:'Onyx Shutters',options:[...base.filter(o=>!/^Color:/.test(o)),'Color: A deliberately long finish description to exercise wrapping in compact contract cards','Panel Config: LLRR','Tilt Type: H3 - Hidden Tiltrod In Stile']},
  {id:'roller',label:'Roller control regression',product:'Roller Shades',options:['Fabric: Room Darkening','Color: White','Lift System: Continuous Cord Loop','Control Side: Right','Hem Bar: Fabric Covered']},
] as const;
