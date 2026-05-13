let masterStaff = {};
let currentData = [];
let historial = {};
let currentMonthData = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, label: "" };

chrome.storage.local.get(['masterStaff'], (result) => {
    if (result.masterStaff) {
        masterStaff = result.masterStaff;
        renderDB();
    }
});

function saveDB() {
    chrome.storage.local.set({ 'masterStaff': masterStaff }, () => {
        const status = document.getElementById('status');
        if (status) {
            status.innerHTML = "✅ Cambios guardados";
            setTimeout(() => { status.innerText = "Datos sincronizados"; }, 2000);
        }
    });
}

function renderDB() {
    const tbody = document.getElementById('dbBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const ids = Object.keys(masterStaff).sort((a,b) => masterStaff[a].nombre.localeCompare(masterStaff[b].nombre));
    ids.forEach(id => {
        const p = masterStaff[id];
        const tr = document.createElement('tr');
        const checks = ['esp_ped','exp_ped','exp_urg','form_trj'].map(k => 
            `<td><input type="checkbox" ${p[k]?'checked':''} data-id="${id}" data-key="${k}"></td>`
        ).join('');
        tr.innerHTML = `<td style="text-align:left; font-weight:600">${p.nombre}</td>${checks}
            <td><select data-id="${id}" data-key="fijo"><option value="">-</option><option value="tri1" ${p.fijo==='tri1'?'selected':''}>Tr1</option><option value="tri2" ${p.fijo==='tri2'?'selected':''}>Tr2</option><option value="obs" ${p.fijo==='obs'?'selected':''}>Obs</option></select></td>
            <td><select data-id="${id}" data-key="rotar"><option value="si" ${p.rotar==='si'?'selected':''}>Si</option><option value="no" ${p.rotar==='no'?'selected':''}>No</option></select></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('input, select').forEach(el => {
        el.onchange = (e) => {
            const {id, key} = e.target.dataset;
            masterStaff[id][key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            saveDB();
        };
    });
}

const btnExpandir = document.getElementById('btnExpandir');
if (btnExpandir) {
    btnExpandir.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
}

// FIX: Usar chrome.tabs.create para evitar el bloqueo de ventanas emergentes de Chrome
document.getElementById('btnImprimir').onclick = async () => {
    const label = currentMonthData.label || "Cuadrante";
    const htmlDiurno = getDistribucionHTML(false);
    const htmlNoche = getDistribucionHTML(true);

    chrome.storage.local.set({ 
        'print_payload': { titulo: `DIURNO - ${label}`, html: htmlDiurno },
        'print_payload_noche': { titulo: `NOCHE - ${label}`, html: htmlNoche }
    }, () => {
        // Abrir ambas pestañas de forma segura
        chrome.tabs.create({ url: chrome.runtime.getURL('print.html?type=payload'), active: false });
        chrome.tabs.create({ url: chrome.runtime.getURL('print.html?type=payload_noche'), active: true });
    });
};

document.getElementById('btnSinc').onclick = () => {
    const btn = document.getElementById('btnSinc');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Extrayendo...";
    btn.disabled = true;
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, {action: "get_data"}, (response) => {
            btn.innerText = originalText;
            btn.disabled = false;
            if (chrome.runtime.lastError) {
                alert("Error: Refresca la página de aTurnos antes de importar.");
                return;
            }
            if (response && response.exito) {
                currentData = response.personal;
                const title = response.mes || "";
                const match = title.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(20\d{2})/i);
                if (match) {
                    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
                    currentMonthData.month = meses.indexOf(match[1].toLowerCase()) + 1;
                    currentMonthData.year = parseInt(match[2]);
                    currentMonthData.label = `${match[1].toUpperCase()} ${match[2]}`;
                } else { currentMonthData.label = title || "Mes Detectado"; }
                document.getElementById('mesLabel').innerText = currentMonthData.label;
                currentData.forEach(p => {
                    if (!masterStaff[p.nombre]) {
                        masterStaff[p.nombre] = { nombre: p.nombre, esp_ped: false, exp_ped: false, exp_urg: false, form_trj: false, fijo: '', rotar: 'si' };
                    }
                });
                renderDB(); saveDB();
                alert("¡Éxito! " + currentData.length + " enfermeros/as listos.");
            } else { alert("Error: " + (response?.error || "Asegúrate de estar en el cuadrante mensual de aTurnos.")); }
        });
    });
};

// Navegación
document.getElementById('step1').onclick = () => {
    document.getElementById('page-staff').classList.add('active');
    document.getElementById('page-gen').classList.remove('active');
    document.getElementById('step1').classList.add('active');
    document.getElementById('step2').classList.remove('active');
};
document.getElementById('step2').onclick = () => {
    document.getElementById('page-staff').classList.remove('active');
    document.getElementById('page-gen').classList.add('active');
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
};

document.getElementById('btnGenerar').onclick = () => {
    if (currentData.length === 0) { alert("Primero importa los datos."); return; }
    document.getElementById('resultZone').style.display = 'block';
    document.getElementById('tablaDiv').innerHTML = getDistribucionHTML(document.getElementById('turnoSel').value === "NOCHE");
};

document.getElementById('turnoSel').onchange = () => {
    document.getElementById('tablaDiv').innerHTML = getDistribucionHTML(document.getElementById('turnoSel').value === "NOCHE");
};

function getCandidate(list, post, exclude = null) {
    if (!list || list.length === 0) return null;
    let pool = exclude ? list.filter(x => Array.isArray(exclude) ? !exclude.includes(x.id) : x.id !== exclude) : list;
    if (pool.length === 0) pool = list; 
    pool.sort((a, b) => {
        const cA = masterStaff[a.id] || {}, cB = masterStaff[b.id] || {};
        if (cA.fijo === post && cB.fijo !== post) return -1;
        if (cB.fijo === post && cA.fijo !== post) return 1;
        const score = (p, pto) => {
            if (pto.includes('tri1')) return (p.exp_urg?10:0) + (p.form_trj?5:0);
            if (pto.includes('tri2') || pto.includes('val2') || pto.includes('v2')) return (p.esp_ped?10:0) + (p.exp_ped?5:0);
            return 0;
        };
        const sA = score(cA, post), sB = score(cB, post);
        if (sA !== sB) return sB - sA;
        return (historial[a.id]?.[post] || 0) - (historial[b.id]?.[post] || 0);
    });
    const el = pool[0];
    if(!historial[el.id]) historial[el.id] = {}; historial[el.id][post] = (historial[el.id][post] || 0) + 1;
    return el;
}

function renderP(p, post) {
    if(!p) return '-';
    const c = masterStaff[p.id] || {};
    let warn = "";
    if (post === 'tri1' && (!c.exp_urg || !c.form_trj)) warn = '<span class="alert-skill">⚠️ !Skill</span>';
    if ((post === 'tri2' || post === 'val2' || post === 'v2') && (!c.esp_ped && !c.exp_ped)) warn = '<span class="alert-skill">⚠️ !Esp</span>';
    return `<div><b style="${warn?'color:var(--danger)':''}">${p.nombre.split(',')[0]}</b>${warn}</div>`;
}

function getDistribucionHTML(modoNoche) {
    historial = {};
    const year = currentMonthData.year;
    const month = currentMonthData.month;
    let html = `<table class="res-table"><thead><tr><th class="dia-col">D</th><th class="num-col">N</th><th>T1</th><th>V1</th><th>V2</th><th>OBS</th>${!modoNoche?'<th>T2</th>':''}<th>ACTIVIDADES</th></tr></thead><tbody>`;

    for (let d = 0; d < 31; d++) {
        const date = new Date(year, month - 1, d + 1);
        if (date.getMonth() !== month - 1) break;
        const dayOfWeek = date.getDay();
        let working = currentData.filter(p => {
            let t = (p.turnos[d] || "").toUpperCase();
            const deBaja = t.includes('(-') || t.includes('BC') || t.includes('AL') || t.includes('PIH') || t.includes('PFA') || t.includes('BR');
            if (deBaja || t === 'V' || t === 'L' || !t || t.includes('DESCANSO')) return false;
            const isN = t.includes('N');
            return modoNoche ? isN : !isN;
        }).map(p => ({ id: p.nombre, nombre: masterStaff[p.nombre]?.nombre || p.nombre, turnoCode: (p.turnos[d]||"").toUpperCase() }));

        if (working.length === 0) continue;

        let asM = { tri1: null, tri2: null, v1: [], v2: [], obs: [] };
        let pM = [...working];
        asM.tri1 = getCandidate(pM, 'tri1'); if(asM.tri1) pM = pM.filter(x => x.id !== asM.tri1.id);
        if(!modoNoche) { asM.tri2 = getCandidate(pM, 'tri2'); if(asM.tri2) pM = pM.filter(x => x.id !== asM.tri2.id); }
        
        const pasos = modoNoche 
            ? [{k:'v1', p:'v1'}, {k:'v2', p:'v2'}, {k:'obs', p:'obs'}, {k:'obs', p:'obs'}, {k:'v1', p:'v1'}]
            : [{k:'v1', p:'v1'}, {k:'v2', p:'v2'}, {k:'obs', p:'obs'}, {k:'v1', p:'v1'}, {k:'v2', p:'v2'}, {k:'obs', p:'obs'}];

        pasos.forEach(s => {
            let c = getCandidate(pM, s.p);
            if(c) { asM[s.k].push(c); pM = pM.filter(x => x.id !== c.id); }
        });
        let dIdx = 0, dests = modoNoche ? ['v1', 'obs', 'v2'] : ['v1', 'v2', 'obs'];
        while(pM.length > 0) { let e = pM.shift(); asM[dests[dIdx % dests.length]].push(e); dIdx++; }

        let asT = null;
        if (!modoNoche) {
            let pTardeTotal = working.filter(p => !p.turnoCode.startsWith('MM') && !p.turnoCode.startsWith('M'));
            asT = { tri1: null, tri2: null, v1: [], v2: [], obs: [] };
            let pPoolT = [...pTardeTotal];
            const fix = (k, p) => { 
                if(p && pTardeTotal.some(x => x.id === p.id) && masterStaff[p.id]?.rotar === 'no') { 
                    if(Array.isArray(asT[k])) asT[k].push(p); else asT[k] = p; pPoolT = pPoolT.filter(x => x.id !== p.id); 
                } 
            };
            fix('tri1', asM.tri1); fix('tri2', asM.tri2);
            asM.v1.forEach(p => fix('v1', p)); asM.v2.forEach(p => fix('v2', p)); asM.obs.forEach(p => fix('obs', p));
            const fill = (k, ex, c=1) => { 
                while((Array.isArray(asT[k])?asT[k].length:(asT[k]?1:0)) < c) { 
                    let cnd = getCandidate(pPoolT, k, ex); if(!cnd) break; 
                    if(Array.isArray(asT[k])) asT[k].push(cnd); else asT[k] = cnd; pPoolT = pPoolT.filter(x => x.id !== cnd.id); 
                } 
            };
            fill('tri1', [asM.tri1?.id, asM.tri2?.id].filter(x=>x), 1); fill('tri2', [asM.tri1?.id, asM.tri2?.id].filter(x=>x), 1);
            fill('v2', null, 2); fill('v1', null, 2); fill('obs', null, 2);
            let dIdxT = 0; while(pPoolT.length > 0) { let e = pPoolT.shift(); asT[dests[dIdxT%3]].push(e); dIdxT++; }
        }

        let tasks = [];
        if(modoNoche) {
            if(dayOfWeek === 0) tasks.push("📦 <b>Pedido Farmacia</b>");
            if(dayOfWeek === 3) tasks.push("🩺 <b>Ok Desf/Carro</b>");
            if(d+1 === (new Date(year, month, 0).getDate() - (month%3))) tasks.push("📆 <b>Caducidad</b>");
        } else {
            if(dayOfWeek === 1) tasks.push("💊 <b>Colocar Farmacia</b>");
            if(dayOfWeek === 4) tasks.push("📦 <b>Pedido Farmacia (M)</b><br>💊 <b>Colocar Farm. (T)</b>");
            if(dayOfWeek === 5) {
                let pCarro = [...working]; let r = []; let seed = d + month + year; 
                for(let i=0; i<2; i++) { if(pCarro.length>0) { let idx = (seed + i) % pCarro.length; r.push(pCarro[idx].nombre.split(',')[0]); pCarro.splice(idx,1); } }
                tasks.push(`🚑 <b>Carro Paradas:</b><br><small style="color:#2563eb">${r.join(' / ')}</small>`);
            }
        }

        let row = `<tr><td class="dia-col">${d+1}</td><td class="num-col">${working.length}</td>`;
        const cell = (m, t, post) => {
            const mH = Array.isArray(m) ? m.map(x => renderP(x, post)).join('') : renderP(m, post);
            if (!t) return mH;
            const tH = Array.isArray(t) ? t.map(x => renderP(x, post)).join('') : renderP(t, post);
            return `<div>${mH}</div><div class="rotation-box"><span class="time-mark">15:00h ➔</span>${tH}</div>`;
        };
        if (modoNoche) { row += `<td>${renderP(asM.tri1, 'tri1')}</td><td>${asM.v1.map(x=>renderP(x,'v1')).join('')}</td><td>${asM.v2.map(x=>renderP(x,'v2')).join('')}</td><td>${asM.obs.map(x=>renderP(x,'obs')).join('')}</td>`;
        } else { row += `<td>${cell(asM.tri1, asT.tri1, 'tri1')}</td><td>${cell(asM.v1, asT.v1, 'v1')}</td><td>${cell(asM.v2, asT.v2, 'v2')}</td><td>${cell(asM.obs, asT.obs, 'obs')}</td><td>${cell(asM.tri2, asT.tri2, 'tri2')}</td>`; }
        row += `<td>${tasks.length ? `<div class="task-box">${tasks.join('')}</div>` : ''}</td></tr>`;
        html += row;
    }
    return html + '</tbody></table>';
}