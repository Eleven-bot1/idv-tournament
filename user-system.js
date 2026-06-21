/* ═══ USER SYSTEM ═══ */
var USER=null;

function handleUserClick(){
  if(USER){ openProfile(); return; }
  switchUserTab('login'); openModal('userModal');
}

function switchUserTab(t){
  var l=document.getElementById('uuTabLogin'), r=document.getElementById('uuTabReg');
  var lf=document.getElementById('uuFormLogin'), rf=document.getElementById('uuFormReg');
  if(!l||!r||!lf||!rf) return;
  if(t==='login'){
    lf.style.display=''; rf.style.display='none';
    l.style.borderBottomColor='var(--gold)'; l.style.color='var(--gold)';
    r.style.borderBottomColor='transparent'; r.style.color='';
  }else{
    lf.style.display='none'; rf.style.display='';
    r.style.borderBottomColor='var(--gold)'; r.style.color='var(--gold)';
    l.style.borderBottomColor='transparent'; l.style.color='';
  }
}

async function doUserLogin(){
  var n=document.getElementById('uu-name'), p=document.getElementById('uu-pass'), e=document.getElementById('uuError');
  if(!n||!p||!e) return;
  n=n.value.trim(); p=p.value;
  if(!n||!p){ e.textContent='请填写用户名和密码'; e.style.display=''; return; }
  try{
    var r=await fetch('/api/login-user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,password:p})});
    var j=await r.json();
    if(j.ok){
      USER=j.user; if(j.user.lastLogin) USER.lastLogin=j.user.lastLogin;
      localStorage.setItem('idv_user',JSON.stringify(USER));
      localStorage.setItem('idv_user_pass',p);
      updateUserBtn(); closeModal('userModal'); toast('欢迎，'+USER.username);
      if(TID) renderForum();
    }else{ e.textContent=j.error; e.style.display=''; }
  }catch(ex){ e.textContent='登录失败'; e.style.display=''; }
}

async function doUserRegister(){
  var n=document.getElementById('uu-reg-name'), p=document.getElementById('uu-reg-pass');
  var p2=document.getElementById('uu-reg-pass2'), e=document.getElementById('uuError');
  if(!n||!p||!e) return;
  n=n.value.trim(); p=p.value; p2=p2?p2.value:'';
  if(!n||!p){ e.textContent='请填写用户名和密码'; e.style.display=''; return; }
  if(p!==p2){ e.textContent='两次密码不一致'; e.style.display=''; return; }
  try{
    var r=await fetch('/api/register-user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,password:p})});
    var j=await r.json();
    if(j.ok){
      USER=j.user;
      localStorage.setItem('idv_user',JSON.stringify(USER));
      localStorage.setItem('idv_user_pass',p);
      updateUserBtn(); closeModal('userModal'); toast('注册成功！');
    }else{ e.textContent=j.error; e.style.display=''; }
  }catch(ex){ e.textContent='注册失败'; e.style.display=''; }
}

function updateUserBtn(){
  var b=document.getElementById('userBtn'); if(!b) return;
  if(USER){
    b.innerHTML="<span style='width:22px;height:22px;border-radius:50%;background:var(--gold);color:#000;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-right:4px'>"+USER.username[0].toUpperCase()+"</span>"+USER.username;
  }else{
    b.innerHTML='👤 登录';
  }
}

function logoutUser(){
  USER=null; localStorage.removeItem('idv_user'); localStorage.removeItem('idv_user_pass');
  updateUserBtn(); closeModal('profileModal'); toast('已退出登录');
}

/* ═══ PROFILE ═══ */
async function openProfile(){
  if(!USER) return;
  document.getElementById('pfAvatar').textContent=USER.username[0].toUpperCase();
  document.getElementById('pfName').textContent=USER.username;
  document.getElementById('pfMeta').textContent='加载中...';
  openModal('profileModal');
  try{
    var r=await fetch('/api/user-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:USER.username,password:localStorage.getItem('idv_user_pass')||''})});
    var j=await r.json();
    if(j.ok){
      var p=j.profile;
      document.getElementById('pfMeta').textContent='注册时间：'+p.registered+' · 上次登录：'+(p.lastLogin||'首次');
      document.getElementById('pfPosts').textContent=p.posts;
      document.getElementById('pfEmail').textContent=p.email||'未填写';
      document.getElementById('pfQQ').textContent=p.qq||'未填写';
      document.getElementById('pfPhone').textContent=p.phone||'未填写';
      document.getElementById('pfBio').textContent=p.bio||'未填写';
      document.getElementById('pf-edit-email').value=p.email||'';
      document.getElementById('pf-edit-qq').value=p.qq||'';
      document.getElementById('pf-edit-phone').value=p.phone||'';
      document.getElementById('pf-edit-bio').value=p.bio||'';
      var tCount=0;
      try{ var tr=await fetch('/api/tournaments'); var list=await tr.json(); list.forEach(function(t){if(t.teamCount>0) tCount++}); }catch(e){}
      document.getElementById('pfTournaments').textContent=tCount;
    }else{
      closeModal('profileModal'); USER=null; localStorage.removeItem('idv_user'); updateUserBtn(); toast('登录已过期');
    }
  }catch(e){ document.getElementById('pfMeta').textContent='加载失败'; }
}

async function changePassword(){
  var oldP=document.getElementById('pf-oldpass').value;
  var newP=document.getElementById('pf-newpass').value;
  if(!newP||newP.length<6){ toast('新密码至少6位',true); return; }
  try{
    var r=await fetch('/api/user-password',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:USER.username,oldPass:oldP,newPass:newP})});
    var j=await r.json();
    if(j.ok){ toast('密码已修改'); document.getElementById('pf-oldpass').value=''; document.getElementById('pf-newpass').value=''; }
    else{ toast(j.error,true); }
  }catch(e){ toast('修改失败',true); }
}

async function saveProfile(){
  if(!USER) return;
  var body={
    username:USER.username, password:localStorage.getItem('idv_user_pass')||'',
    email:document.getElementById('pf-edit-email').value.trim(),
    qq:document.getElementById('pf-edit-qq').value.trim(),
    phone:document.getElementById('pf-edit-phone').value.trim(),
    bio:document.getElementById('pf-edit-bio').value.trim()
  };
  try{
    var r=await fetch('/api/user-profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json();
    if(j.ok){
      document.getElementById('pfEmail').textContent=body.email||'未填写';
      document.getElementById('pfQQ').textContent=body.qq||'未填写';
      document.getElementById('pfPhone').textContent=body.phone||'未填写';
      document.getElementById('pfBio').textContent=body.bio||'未填写';
      toast('资料已保存');
    }else{ toast(j.error,true); }
  }catch(e){ toast('保存失败',true); }
}

/* ═══ ADMIN USER MGMT ═══ */
async function openUserAdmin(){
  if(!ADMIN) return;
  openModal('adminUserModal');
  document.getElementById('adminUserEdit').style.display='none';
  try{
    var r=await fetch('/api/admin/users',{headers:{'x-admin-pass':ADMIN_PASS}});
    var j=await r.json();
    var h="<table class='st-table'><thead><tr><th>用户名</th><th>密码</th><th>邮箱</th><th>QQ</th><th>电话</th><th>操作</th></tr></thead><tbody>";
    j.users.forEach(function(u){
      h+="<tr data-uid='"+u.id+"'><td class='st-team'>"+esc(u.username)+"</td><td>"+esc(u.password)+"</td><td>"+(u.email||'-')+"</td><td>"+(u.qq||'-')+"</td><td>"+(u.phone||'-')+"</td><td><button class='btn btn-outline btn-xs au-edit-btn'>编辑</button></td></tr>";
    });
    h+="</tbody></table>";
    document.getElementById('adminUserList').innerHTML=h||"<div class='empty-state'><p>暂无用户</p></div>";
    setTimeout(function(){
      document.querySelectorAll('.au-edit-btn').forEach(function(btn){
        btn.onclick=function(){ var uid=this.closest('tr').getAttribute('data-uid'); editUserAdmin(uid); };
      });
    },100);
  }catch(e){}
}

function editUserAdmin(id){
  if(!ADMIN) return;
  document.getElementById('adminUserEdit').style.display='';
  document.getElementById('au-id').value=id;
}

async function saveUserAdmin(){
  var id=document.getElementById('au-id').value; if(!id) return;
  var body={
    password:document.getElementById('au-pwd').value,
    email:document.getElementById('au-email').value.trim(),
    qq:document.getElementById('au-qq').value.trim(),
    phone:document.getElementById('au-phone').value.trim(),
    bio:document.getElementById('au-bio').value.trim()
  };
  try{
    var r=await fetch('/api/admin/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json','x-admin-pass':ADMIN_PASS},body:JSON.stringify(body)});
    var j=await r.json();
    if(j.ok){ toast('已保存'); openUserAdmin(); }
    else{ toast(j.error,true); }
  }catch(e){ toast('保存失败',true); }
}

async function deleteUserAdmin(){
  if(!confirm('确定删除？')) return;
  var id=document.getElementById('au-id').value;
  try{
    await fetch('/api/admin/users/'+id,{method:'DELETE',headers:{'x-admin-pass':ADMIN_PASS}});
    toast('已删除'); document.getElementById('adminUserEdit').style.display='none'; openUserAdmin();
  }catch(e){ toast('删除失败',true); }
}

/* ═══ AUTO-RESTORE ═══ */
(function(){
  var u=localStorage.getItem('idv_user');
  if(u){ try{ USER=JSON.parse(u); setTimeout(updateUserBtn,200); }catch(e){} }
})();
