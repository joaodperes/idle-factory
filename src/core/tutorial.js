/** A guided, interactive first production line. Conditions are evaluated against the actual graph. */
export const TUTORIAL_STEPS = [
  {title:'Connect your first power cable',text:'Machines need electricity. Click the glowing gold output on the Power Station, then the gold input on the Ore Extractor.',hint:'Gold ports carry power. Teal ports carry materials.',source:['generator','power'],target:['mine','power'],condition:s=>linked(s,'generator','mine','power')},
  {title:'Build a Smelter',text:'Your extractor can dig ore, but ore is not refined metal. Press + beside the highlighted Smelter in Build facilities.',hint:'The new Smelter will appear in the diagram.',build:'smelter',condition:s=>has(s,'smelter')},
  {title:'Feed ore into the Smelter',text:'Click the teal ore output on the Ore Extractor, then the teal ore input on the Smelter.',hint:'An ore link transfers resources from one machine to another.',source:['mine','ore'],target:['smelter','ore'],condition:s=>linked(s,'mine','smelter','ore')},
  {title:'Power the Smelter',text:'Click the Power Station gold output and connect it to the Smelter gold input. Now it can process the incoming ore.',hint:'One power station can supply multiple facilities.',source:['generator','power'],target:['smelter','power'],condition:s=>linked(s,'generator','smelter','power')},
  {title:'Build a Trade Terminal',text:'The Smelter is producing metal. Buy a Trade Terminal so you can sell it for credits.',hint:'Credits will fund your next production line.',build:'market',condition:s=>has(s,'market')},
  {title:'Deliver metal to the market',text:'Connect the teal metal output on the Smelter to the teal input on the Trade Terminal.',hint:'The terminal accepts products and sells metal automatically.',source:['smelter','metal'],target:['market','any'],condition:s=>linked(s,'smelter','market','metal')},
  {title:'Watch your first sale',text:'Your production chain is complete! Let the factory run for a moment. When the Trade Terminal sells metal, your credits and revenue increase.',hint:'If revenue stays at zero, check your power and ore connections.',condition:s=>s.runRevenue>0},
  {title:'You are running a factory!',text:'You have built a complete production chain. Next: expand into parts, fulfill contracts, level up your manager and eventually attract investors.',hint:'You can replay this walkthrough as a safe practice session from the ? button.',done:true,condition:()=>false}
];
function has(state,kind){return state.nodes.some(n=>n.kind===kind);}
function linked(state,a,b,resource){return state.edges.some(e=>e.resource===resource&&state.nodes.some(n=>n.id===e.from&&n.kind===a)&&state.nodes.some(n=>n.id===e.to&&n.kind===b));}
export function advanceTutorial(state){
  if(state.onboarding)return false;
  const previous=state.tutorialStep||0;
  while(state.tutorialStep<TUTORIAL_STEPS.length-1 && TUTORIAL_STEPS[state.tutorialStep].condition(state))state.tutorialStep++;
  return previous!==state.tutorialStep;
}
export function tutorialPort(state,pending){
  if(state.onboarding)return null;
  const step=TUTORIAL_STEPS[state.tutorialStep];
  if(!step?.source)return null;
  return pending ? {side:'in',kind:step.target[0],resource:step.target[1]} : {side:'out',kind:step.source[0],resource:step.source[1]};
}
