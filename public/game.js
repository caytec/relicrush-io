'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize(){canvas.width=innerWidth;canvas.height=innerHeight;}
addEventListener('resize',resize);resize();
function render(){ctx.fillStyle='#173f3d';ctx.fillRect(0,0,canvas.width,canvas.height);requestAnimationFrame(render);}
render();
