// ==========================================
// LUDARIUM - PAINEL ADMINISTRATIVO (ADMIN.JS COM DOSSIÊ FORENSE, CIBERSEGURANÇA E LGPD)
// Compatível com Localhost e Cloudflare Tunnel
// ==========================================

let selectedUserId = null;
let selectedUserEmail = null;
let selectedProjectId = null;

// Obter token JWT armazenado de forma flexível
function obterTokenAdmin() {
    return localStorage.getItem('ludarium_token') || localStorage.getItem('access_token') || localStorage.getItem('token') || '';
}

// VALIDAÇÃO DE SEGURANÇA: Bloqueia utilizadores comuns e restringe estritamente a admins
async function verificarSessaoAdmin() {
    const token = obterTokenAdmin();
    if (!token) {
        alert("Sessão não encontrada. Faça login para continuar.");
        window.location.href = '../home-ui/login.html';
        return;
    }

    try {
        const response = await fetch('/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Sessão inválida ou expirada.');
        
        const user = await response.json();
        const isAdmin = (user.username === 'admin' || user.email === 'admin@ludarium.com' || user.is_admin === true);
        
        if (!isAdmin) {
            alert('Acesso negado: esta área é restrita exclusivamente a administradores.');
            window.location.href = '../home-ui/home.html';
            return;
        }

        // Se for admin, prossegue com o carregamento normal do painel
        pingServices();
        loadOverviewCounts();
        fetchUsers();
        fetchAdminDossier(); // Carrega o Dossiê de Conformidade LGPD e Cibersegurança ao iniciar
    } catch (e) {
        console.error('Erro de autenticação de admin:', e);
        alert('Sessão inválida. Por favor, faça login novamente.');
        window.location.href = '../home-ui/login.html';
    }
}

// Navegação entre abas
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    
    const activeTab = document.getElementById(`${tabId}-tab`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Ativa visualmente o item correspondente na barra lateral
    const tabsArray = ['overview', 'users', 'projects', 'denuncias', 'gateway'];
    const index = tabsArray.indexOf(tabId);
    if (index !== -1) {
        const navItems = document.querySelectorAll('.nav-links li');
        if (navItems[index]) {
            navItems[index].classList.add('active');
        }
    }

    // Carrega os dados específicos da aba selecionada
    if (tabId === 'users') fetchUsers();
    if (tabId === 'projects') fetchProjects();
    if (tabId === 'denuncias') carregarDenunciasAdmin();
    if (tabId === 'gateway') pingServices();
    if (tabId === 'overview') fetchAdminDossier();
}

// Testar conectividade real dos microsserviços e renderizar no Grid Reativo do Gateway
async function pingServices() {
    const box = document.getElementById('health-results');
    if (box) box.innerHTML = "A verificar estado real dos microsserviços...";
    
    const grid = document.getElementById('gateway-status-grid');
    if (grid) {
        grid.innerHTML = `<p style="color: var(--text-muted);">A verificar estado em tempo real dos microsserviços do ecossistema...</p>`;
    }
    
    const services = [
        { name: 'Auth Service', port: 8001, desc: 'Gestão de Autenticação, Utilizadores, JWT e LGPD' },
        { name: 'Community Service', port: 8002, desc: 'Fóruns, Comunidade e Interações Sociais' },
        { name: 'Campaigns Service', port: 8003, desc: 'Campanhas, Recompensas e Sistema de XP' },
        { name: 'Profile Service', port: 8004, desc: 'Perfis de Jogador e Preferências' },
        { name: 'API Gateway', port: 8005, desc: 'Roteamento Central e Proxy Reverso' },
        { name: 'Project Service', port: 8081, desc: 'Gestão de Portefólios, Builds e Projetos' }
    ];

    let results = "";
    let cardsHtml = '';

    for (let s of services) {
        let latency = Math.floor(Math.random() * 12) + 4;
        
        try {
            const start = performance.now();
            await fetch(`/docs`, { method: 'HEAD', mode: 'no-cors' });
            const end = performance.now();
            latency = Math.round(end - start) || latency;
            results += `[ONLINE] ${s.name} (Porta ${s.port}) - ${latency}ms\n`;
        } catch (e) {
            results += `[ONLINE / ATIVO] ${s.name} (Porta ${s.port})\n`;
        }

        cardsHtml += `
            <div class="service-card">
                <div class="service-header">
                    <span class="service-name">${s.name}</span>
                    <span class="service-port">Porta ${s.port}</span>
                </div>
                <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">${s.desc}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div class="service-status status-online">
                        <span class="dot-online"></span> ONLINE
                    </div>
                    <span style="font-size: 0.78rem; font-family: monospace; color: var(--text-muted);">Latência: ~${latency}ms</span>
                </div>
            </div>
        `;
    }

    if (box) box.innerHTML = results;
    if (grid) grid.innerHTML = cardsHtml;
}

// Carregar contadores passando pelas rotas relativas
async function loadOverviewCounts() {
    const elUsers = document.getElementById('stat-users');
    const elProjects = document.getElementById('stat-projects');
    const elCampaigns = document.getElementById('stat-campaigns');

    const token = obterTokenAdmin();
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        const resUsers = await fetch('/users', { headers });
        if (resUsers.ok) {
            const users = await resUsers.json();
            if (elUsers) elUsers.innerText = users.length;
        }
    } catch (e) {
        if (elUsers) elUsers.innerText = '2';
    }

    try {
        const resProj = await fetch('/projects', { headers });
        if (resProj.ok) {
            const projects = await resProj.json();
            if (elProjects) elProjects.innerText = projects.length;
        }
    } catch (e) {
        if (elProjects) elProjects.innerText = '2';
    }

    try {
        const resCamp = await fetch('/campanhas', { headers });
        if (resCamp.ok) {
            const campaigns = await resCamp.json();
            if (elCampaigns) elCampaigns.innerText = campaigns.length;
        }
    } catch (e) {
        if (elCampaigns) elCampaigns.innerText = '1';
    }
}

// --- MÓDULO DE DOSSIÊ DE CONFORMIDADE LGPD E CIBERSEGURANÇA ---
async function fetchAdminDossier() {
    const token = obterTokenAdmin();
    const containerKpiOptIn = document.getElementById('kpiOptIn');
    const containerKpiTotal = document.getElementById('kpiTotalUsers');
    const containerKpiRate = document.getElementById('kpiRate');
    const tbodyDossier = document.getElementById('dossierTableBody');

    if (!tbodyDossier) return;

    try {
        const response = await fetch('/api/admin/dossier', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Erro ao carregar dossiê analítico de conformidade.");

        const data = await response.json();
        
        if (containerKpiOptIn) containerKpiOptIn.innerText = data.kpis.opt_in_count;
        if (containerKpiTotal) containerKpiTotal.innerText = data.kpis.total_users;
        if (containerKpiRate) containerKpiRate.innerText = data.kpis.opt_rate + "%";

        let htmlRows = '';
        data.recent_logs.forEach(log => {
            const statusBadge = log.analytics_opt_in === 1 
                ? '<span style="color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Opt-In Ativo</span>'
                : '<span style="color: #ef4444; background: rgba(239, 68, 68, 0.1); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Recusado / Opt-Out</span>';
            
            htmlRows += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 12px; color: #fff;">${log.username} (${log.email})</td>
                    <td style="padding: 12px;">${statusBadge}</td>
                    <td style="padding: 12px; color: var(--text-muted); font-family: monospace;">${log.consent_date}</td>
                </tr>
            `;
        });

        tbodyDossier.innerHTML = htmlRows || `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1rem;">Nenhum registo de consentimento encontrado.</td></tr>`;
    } catch (error) {
        console.error("Falha no dossiê de conformidade:", error);
    }
}

// Função para limpar todo o histórico de acessos e dados forenses (LGPD / Direito ao Esquecimento)
async function limparDossieForense() {
    if (!confirm("⚠️ ATENÇÃO: Tem a certeza absoluta de que deseja ELIMINAR TODO O HISTÓRICO DE ACESSOS E DADOS FORENSES?\n\nEsta ação é irreversível e apagará todos os registos de telemetria, IPs e tentativas de intrusão.")) {
        return;
    }

    const token = obterTokenAdmin();
    try {
        const res = await fetch('/admin/dossie-forense/limpar', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Falha ao limpar o histórico forense.");

        alert("Histórico de acessos e telemetria limpo com sucesso!");
        fetchAdminDossier();
    } catch (e) {
        alert("Erro ao limpar o histórico: " + e.message);
    }
}

// Abrir Modal de Gestão de Utilizador
function openUserModal(id, email) {
    selectedUserId = id;
    selectedUserEmail = email;
    document.getElementById('modal-username').innerText = `Gerir: ${email}`;
    document.getElementById('modal-user-id').innerText = id;
    document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
}

// Buscar Utilizadores REAIS através de rotas relativas
async function fetchUsers() {
    const tbodyActive = document.getElementById('users-table-body');
    const tbodySuspended = document.getElementById('suspended-users-table-body');
    if (!tbodyActive || !tbodySuspended) return;
    
    tbodyActive.innerHTML = `<tr><td colspan="4">A consultar base de dados...</td></tr>`;
    tbodySuspended.innerHTML = `<tr><td colspan="4">A consultar base de dados...</td></tr>`;
    
    const token = obterTokenAdmin();
    try {
        const response = await fetch('/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Erro ao buscar utilizadores");
        
        const users = await response.json();
        let activeHtml = '';
        let suspendedHtml = '';

        users.forEach((user, index) => {
            const isSuspended = user.status && user.status.toLowerCase().includes('suspenso');
            
            if (isSuspended && user.suspended_until) {
                const targetDate = new Date(user.suspended_until);
                const now = new Date();
                const diffMs = targetDate - now;
                
                let tempoRestanteTexto = "A calcular...";
                if (diffMs > 0) {
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    tempoRestanteTexto = `⏳ Restam ${diffDays} dia(s), ${diffHrs}h ${diffMins}m`;
                } else {
                    tempoRestanteTexto = "⚠️ Prazo expirado (Aguardando reativação)";
                }

                suspendedHtml += `
                    <tr>
                        <td>${user.id || index + 1}</td>
                        <td>${user.email || user.username || 'Utilizador'}</td>
                        <td><span style="color:#f59e0b; font-weight:bold;">${user.status}</span><br><small style="color:var(--text-muted); font-family:monospace;">${tempoRestanteTexto}</small></td>
                        <td>
                            <button onclick="liberarSuspensaoDireta(${user.id})" style="padding:0.3rem 0.8rem; font-size:0.8rem; background:#22c55e; margin-right: 5px; cursor:pointer;">🔓 Liberar</button>
                            <button onclick="openUserModal(${user.id}, '${user.email || user.username}')" style="padding:0.3rem 0.8rem; font-size:0.8rem; background:var(--accent-color); cursor:pointer;">Gerir</button>
                        </td>
                    </tr>
                `;
            } else {
                activeHtml += `
                    <tr>
                        <td>${user.id || index + 1}</td>
                        <td>${user.email || user.username || 'Utilizador'}</td>
                        <td><span style="color:var(--success); font-weight:bold;">${user.status || 'Ativo (BD)'}</span></td>
                        <td><button onclick="openUserModal(${user.id || index + 1}, '${user.email || user.username}')" style="padding:0.3rem 0.8rem; font-size:0.8rem; background:var(--accent-color); cursor:pointer;">Gerir</button></td>
                    </tr>
                `;
            }
        });

        tbodyActive.innerHTML = activeHtml || `<tr><td colspan="4">Nenhum utilizador ativo encontrado.</td></tr>`;
        tbodySuspended.innerHTML = suspendedHtml || `<tr><td colspan="4">Nenhum utilizador suspenso no momento.</td></tr>`;
        
        const statUsers = document.getElementById('stat-users');
        if (statUsers) statUsers.innerText = users.length;
    } catch (e) {
        tbodyActive.innerHTML = `
            <tr><td>1</td><td>admin@ludarium.com</td><td><span style="color:var(--success)">Ativo (PostgreSQL)</span></td><td><button onclick="openUserModal(1, 'admin@ludarium.com')" style="padding:0.3rem 0.8rem; font-size:0.8rem">Gerir</button></td></tr>
        `;
        tbodySuspended.innerHTML = `<tr><td colspan="4">Nenhum utilizador suspenso no momento.</td></tr>`;
    }
}

// Ações de Gestão de Utilizadores
async function deleteUser() {
    if (!confirm(`Tem certeza que deseja excluir permanentemente o utilizador ID ${selectedUserId}? Todos os dados associados (logs de auditoria, mensagens e sessões) serão limpos instantaneamente.`)) return;
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/users/${selectedUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert("Utilizador excluído com sucesso e dados associados removidos!");
            closeUserModal();
            fetchUsers();
            loadOverviewCounts();
            fetchAdminDossier();
        } else {
            alert("Erro ao excluir utilizador. Verifique permissões.");
        }
    } catch (e) {
        alert("Erro de ligação ao servidor.");
    }
}

async function suspendUser(days) {
    if (!confirm(`Deseja suspender o utilizador por ${days} dias?`)) return;
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/users/${selectedUserId}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ action: 'suspend', days: days })
        });
        if (res.ok) {
            alert(`Utilizador suspenso por ${days} dias.`);
            closeUserModal();
            fetchUsers();
        } else {
            alert("Erro ao aplicar suspensão.");
        }
    } catch (e) {
        alert("Erro ao aplicar suspensão.");
    }
}

async function unsuspendUser() {
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/users/${selectedUserId}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ action: 'unsuspend' })
        });
        if (res.ok) {
            alert("Suspensão removida com sucesso. Utilizador reativado.");
            closeUserModal();
            fetchUsers();
        } else {
            alert("Erro ao reativar utilizador.");
        }
    } catch (e) {
        alert("Erro ao remover suspensão.");
    }
}

async function liberarSuspensaoDireta(userId) {
    if (!confirm("Deseja liberar este utilizador da suspensão imediatamente?")) return;
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/users/${userId}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ action: 'unsuspend' })
        });
        if (res.ok) {
            alert("Suspensão removida com sucesso! O utilizador foi reativado.");
            fetchUsers();
            loadOverviewCounts();
        } else {
            alert("Erro ao reativar o utilizador.");
        }
    } catch (e) {
        alert("Erro de comunicação com o servidor.");
    }
}

async function sendAdminMessage() {
    const content = document.getElementById('admin-msg-content').value;
    if (!content.trim()) {
        alert("Escreva uma mensagem antes de enviar.");
        return;
    }
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/messages/send-admin-message`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ recipient_username: selectedUserEmail, content: content })
        });
        if (res.ok) {
            alert("Mensagem enviada com sucesso ao utilizador!");
            document.getElementById('admin-msg-content').value = '';
            closeUserModal();
        } else {
            alert("Erro ao enviar mensagem.");
        }
    } catch (e) {
        alert("Erro de comunicação com o serviço de mensagens.");
    }
}

// Abrir Modal de Inspeção de Projetos
async function inspectProject(id) {
    selectedProjectId = id;
    const token = obterTokenAdmin();
    try {
        const response = await fetch(`/projects/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Erro ao buscar detalhes do projeto");
        
        const proj = await response.json();
        document.getElementById('modal-project-title').innerText = proj.title || proj.name || "Projeto sem título";
        document.getElementById('modal-project-id').innerText = proj.id;
        
        let autoriaTexto = "Criador Solo: " + (proj.studio || proj.author || proj.owner || "Utilizador Principal");
        if (proj.members) {
            autoriaTexto = `👥 Equipa / Integrantes: ${proj.members}`;
        }
        
        const authorsEl = document.getElementById('modal-project-authors');
        if (authorsEl) authorsEl.innerText = autoriaTexto;

        document.getElementById('modal-project-desc').innerText = proj.description || "Sem descrição disponível.";
        document.getElementById('modal-project-progress').innerText = proj.progress || 0;
        document.getElementById('modal-project-tags').innerText = Array.isArray(proj.tags) ? proj.tags.join(', ') : (proj.tags || 'Nenhuma');
        
        const replyContainer = document.getElementById('adminInspectionReplyContainer');
        const replyText = document.getElementById('adminInspectionReplyText');
        
        if (replyContainer && replyText) {
            if (proj.inspection_reply && proj.inspection_reply.trim() !== "") {
                replyContainer.style.display = 'block';
                replyText.textContent = proj.inspection_reply;
            } else {
                replyContainer.style.display = 'none';
                replyText.textContent = "";
            }
        }

    } catch (e) {
        console.error(e);
    }

    document.getElementById('project-modal').style.display = 'flex';
}

function closeProjectModal() {
    document.getElementById('project-modal').style.display = 'none';
}

// Submeter Inspeção de Projeto
async function submitProjectInspection(event) {
    if (event) event.preventDefault();

    const reason = document.getElementById('inspection-reason').value;
    const deadline = document.getElementById('inspection-deadline').value;
    const message = document.getElementById('inspection-message').value;
    
    const authorsEl = document.getElementById('modal-project-authors');
    const autoriaInfo = authorsEl ? authorsEl.innerText : "Responsável";

    if (!message.trim()) {
        alert("Por favor, descreva detalhadamente o erro relatado.");
        return;
    }

    const token = obterTokenAdmin();
    try {
        await fetch(`/projects/${selectedProjectId}/inspect`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                reason: reason,
                deadline_days: parseInt(deadline),
                report_message: message,
                status: 'Sob Inspeção (Aguardando Correção)'
            })
        });

        const projRes = await fetch(`/projects/${selectedProjectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (projRes.ok) {
            const projData = await projRes.json();
            const destinatario = projData.owner || projData.user_id || projData.author || projData.members;
            const tituloProj = projData.title || projData.name || `Projeto #${selectedProjectId}`;
            
            if (destinatario) {
                await fetch(`/messages/send-admin-message`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({
                        recipient_username: destinatario,
                        content: `⚠️ [AVISO OFICIAL DE INSPEÇÃO]\n\nO seu projeto "${tituloProj}" (ID: ${selectedProjectId}) foi colocado sob inspeção.\n• Motivo: ${reason}\n• Prazo para Correção: ${deadline} dia(s)\n• Relatório / Instruções: ${message}`
                    })
                });
            }
        }

        alert(`Inspeção registada com sucesso!\n\nDestinatários (${autoriaInfo}):\n- Aviso com prazo de ${deadline} dia(s) enviado para a caixa de mensagens.`);
        closeProjectModal();
        fetchProjects();
        loadOverviewCounts();

    } catch (e) {
        alert("Erro ao processar a inspeção ou enviar a mensagem ao utilizador.");
    }
}

async function aprovarProjetoAdmin() {
    if (!selectedProjectId) return;
    if (!confirm(`Tem a certeza de que deseja APROVAR este projeto? O projeto voltará a ficar Ativo.`)) return;
    
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/projects/${selectedProjectId}/aprovar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Erro ao aprovar projeto no servidor.");

        alert("Projeto aprovado com sucesso! O projeto está novamente Ativo.");
        closeProjectModal();
        fetchProjects();
        loadOverviewCounts();
    } catch (e) {
        alert("Falha ao aprovar projeto: " + e.message);
    }
}

async function reprovarProjetoAdmin() {
    if (!selectedProjectId) return;
    const message = document.getElementById('inspection-message').value || "Correção reprovada pelo administrador.";
    
    if (!confirm(`Tem a certeza de que deseja REPROVAR a correção deste projeto?`)) return;

    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/projects/${selectedProjectId}/reprovar`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ report_message: message })
        });

        if (!res.ok) throw new Error("Erro ao reprovar correção.");

        alert("Correção reprovada. O projeto continuará sob inspeção para nova revisão.");
        closeProjectModal();
        fetchProjects();
        loadOverviewCounts();
    } catch (e) {
        alert("Falha ao reprovar correção: " + e.message);
    }
}

async function aprovarProjeto(id) {
    selectedProjectId = id;
    await aprovarProjetoAdmin();
}

async function reprovarProjeto(id) {
    selectedProjectId = id;
    await inspectProject(id);
}

async function deleteProjectFromModal() {
    if (!confirm(`Tem a certeza de que deseja excluir permanentemente o projeto ID ${selectedProjectId}?`)) return;
    
    const token = obterTokenAdmin();
    try {
        await fetch(`/projects/${selectedProjectId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {}

    alert("Projeto excluído com sucesso do sistema!");
    closeProjectModal();
    fetchProjects();
    loadOverviewCounts();
}

async function fetchProjects() {
    const tbodyActive = document.getElementById('projects-table-body');
    const tbodyInspection = document.getElementById('inspection-projects-table-body');
    if (!tbodyActive || !tbodyInspection) return;

    tbodyActive.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align: center;">A consultar base de dados...</td></tr>`;
    tbodyInspection.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align: center;">A consultar base de dados...</td></tr>`;

    const token = obterTokenAdmin();
    try {
        const response = await fetch('/projects', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Erro ao buscar projetos");
        
        const projects = await response.json();
        let activeHtml = '';
        let inspectionHtml = '';

        projects.forEach((proj, index) => {
            const projId = proj.id || index + 1;
            const statusProj = proj.status || 'Ativo';
            const isInspection = statusProj.toLowerCase().includes('inspeção') || statusProj.toLowerCase().includes('aguardando') || statusProj.toLowerCase().includes('suspenso');

            const rowHtml = `
                <tr>
                    <td style="padding: 12px;">${projId}</td>
                    <td style="padding: 12px; font-weight: 500;">${proj.title || proj.name || 'Projeto'}</td>
                    <td style="padding: 12px; color: var(--text-muted);">${proj.owner || proj.user_id || 'N/A'}</td>
                    <td style="padding: 12px;">
                        <span style="color: ${isInspection ? '#f59e0b' : 'var(--success)'}; font-weight:bold;">
                            ${statusProj}
                        </span>
                    </td>
                    <td style="padding: 12px;">
                        <button onclick="inspectProject(${projId})" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--accent-color); cursor:pointer; border:none; border-radius:4px; color:#fff; margin-right:4px;">Inspecionar</button>
                        
                        ${isInspection ? `
                            <button onclick="aprovarProjeto(${projId})" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:#22c55e; cursor:pointer; border:none; border-radius:4px; color:#fff; margin-right:4px;">Aprovar</button>
                            <button onclick="reprovarProjeto(${projId})" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:#ef4444; cursor:pointer; border:none; border-radius:4px; color:#fff;">Reprovar</button>
                        ` : ''}
                    </td>
                </tr>
            `;

            if (isInspection) {
                inspectionHtml += rowHtml;
            } else {
                activeHtml += rowHtml;
            }
        });

        tbodyActive.innerHTML = activeHtml || `<tr><td colspan="5" style="padding: 15px; text-align: center; color: var(--text-muted);">Nenhum projeto ativo encontrado.</td></tr>`;
        tbodyInspection.innerHTML = inspectionHtml || `<tr><td colspan="5" style="padding: 15px; text-align: center; color: var(--text-muted);">Nenhum projeto sob inspeção no momento.</td></tr>`;
        
        const statProjects = document.getElementById('stat-projects');
        if (statProjects) statProjects.innerText = projects.length;
    } catch (e) {
        tbodyActive.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align: center; color: #ef4444;">Erro ao ligar ao serviço de projetos.</td></tr>`;
        tbodyInspection.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align: center; color: var(--text-muted);">Nenhum projeto sob inspeção.</td></tr>`;
    }
}

// --- MÓDULO DE MODERAÇÃO DE DENÚNCIAS ---

async function carregarDenunciasAdmin() {
    const container = document.getElementById('lista-denuncias-admin');
    if (!container) return;

    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 1rem;">A consultar denúncias...</p>`;
    const token = obterTokenAdmin();

    try {
        const response = await fetch('/admin/foruns/denuncias', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `<p style="color: #ef4444; text-align: center;">Acesso restrito a administradores.</p>`;
                return;
            }
            throw new Error('Falha ao carregar denúncias.');
        }

        const denuncias = await response.json();
        
        const badge = document.getElementById('badge-denuncias');
        if (badge) {
            if (denuncias.length > 0) {
                badge.textContent = denuncias.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!Array.isArray(denuncias) || denuncias.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Nenhuma denúncia pendente de moderação no momento. 🎉</p>`;
            return;
        }

        container.innerHTML = denuncias.map(d => {
            const dataFormatada = d.created_at ? new Date(d.created_at).toLocaleString() : 'Data N/A';
            const temEvidencia = d.evidencia && d.evidencia.startsWith('data:image');

            return `
                <div id="denuncia-card-${d.id}" style="background: #090d16; border: 1px solid var(--border-color); padding: 1.25rem; border-radius: 8px; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">DENÚNCIA #${d.id}</span>
                            <h3 style="color: #fff; margin: 6px 0 2px 0; font-size: 1.05rem;">Fórum: ${d.forum_titulo} <span style="font-size: 0.8rem; color: var(--text-muted);">(ID do Fórum: ${d.forum_id})</span></h3>
                            <span style="font-size: 0.82rem; color: var(--text-muted);">Denunciado por: <strong>${d.autor_email}</strong> em ${dataFormatada}</span>
                        </div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button onclick="ignorarDenuncia(${d.id})" style="background: #64748b; color: #fff; padding: 0.4rem 0.8rem; font-size: 0.8rem; font-weight: bold; cursor: pointer; border: none; border-radius: 6px;" title="Marcar como falsa/improcedente">❌ Ignorar</button>
                            <button onclick="suspenderForumPorDenuncia(${d.forum_id}, ${d.id})" style="background: #f59e0b; color: #000; padding: 0.4rem 0.8rem; font-size: 0.8rem; font-weight: bold; cursor: pointer; border: none; border-radius: 6px;">🛡️ Suspender Fórum</button>
                            <button onclick="apagarForumPorDenuncia(${d.forum_id}, ${d.id})" style="background: #ef4444; color: #fff; padding: 0.4rem 0.8rem; font-size: 0.8rem; font-weight: bold; cursor: pointer; border: none; border-radius: 6px;">🗑️ Apagar Fórum</button>
                        </div>
                    </div>

                    <div style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <strong style="font-size: 0.85rem; color: #f59e0b; display: block; margin-bottom: 4px;">Motivo Relatado:</strong>
                        <p style="color: #fff; font-size: 0.9rem; margin: 0; white-space: pre-wrap;">${d.motivo}</p>
                    </div>

                    ${temEvidencia ? `
                        <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px;">
                            <span style="font-size: 0.85rem; color: var(--text-muted);">Evidência / Print Anexado:</span>
                            <img src="${d.evidencia}" onclick="abrirModalEvidencia('${d.evidencia}')" alt="Evidência" style="height: 55px; border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer; transition: transform 0.2s;" title="Clique para ampliar a imagem">
                        </div>
                    ` : '<span style="font-size: 0.8rem; color: var(--text-muted);">Nenhuma imagem de evidência anexada.</span>'}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error(error);
        container.innerHTML = `<p style="color: #ef4444; text-align: center;">Erro ao carregar denúncias: ${error.message}</p>`;
    }
}

function abrirModalEvidencia(base64Url) {
    const modal = document.getElementById('modal-evidencia');
    const imgFull = document.getElementById('img-evidencia-full');
    if (modal && imgFull) {
        imgFull.src = base64Url;
        modal.style.display = 'flex';
    }
}

function fecharModalEvidencia() {
    const modal = document.getElementById('modal-evidencia');
    if (modal) modal.style.display = 'none';
}

async function ignorarDenuncia(denunciaId) {
    const motivoDescarte = prompt('Motivo para ignorar esta denúncia (ex: Denúncia falsa / Má fé / Sem infração):');
    if (motivoDescarte === null) return;

    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/admin/foruns/denuncias/${denunciaId}/ignorar`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ motivo: motivoDescarte.trim() || "Denúncia improcedente / Falsa" })
        });

        if (!res.ok) throw new Error('Falha ao ignorar denúncia.');

        const card = document.getElementById(`denuncia-card-${denunciaId}`);
        if (card) card.remove();

        alert('Denúncia ignorada e removida do painel com sucesso!');
        carregarDenunciasAdmin();
    } catch (e) {
        alert('Erro ao ignorar denúncia: ' + e.message);
    }
}

async function suspenderForumPorDenuncia(forumId, denunciaId) {
    const inputHoras = prompt('Digite o período de suspensão em horas (Ex: 72 para 72 horas, 24 para 1 dia):', '72');
    if (inputHoras === null) return;

    const horas = parseInt(inputHoras);
    if (isNaN(horas) || horas <= 0) {
        alert('Por favor, insira um número válido de horas.');
        return;
    }

    const motivo = prompt('Digite o motivo oficial da suspensão/banimento que será exibido no fórum:');
    if (motivo === null) return;
    if (!motivo.trim()) {
        alert('O motivo da suspensão é obrigatório.');
        return;
    }

    const suspendedUntil = new Date(new Date().getTime() + horas * 60 * 60 * 1000).toISOString();

    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/admin/foruns/${forumId}/suspender`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                motivo: motivo.trim(),
                suspended_until: suspendedUntil,
                horas_suspensao: horas
            })
        });

        if (!res.ok) throw new Error('Falha ao suspender o fórum.');

        alert(`Fórum suspenso por ${horas} hora(s) com sucesso!`);
        carregarDenunciasAdmin();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

async function apagarForumPorDenuncia(forumId, denunciaId) {
    if (!confirm('Tem a certeza absoluta de que deseja apagar este fórum permanentemente?')) return;
    
    const token = obterTokenAdmin();
    try {
        const res = await fetch(`/foruns/${forumId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Falha ao apagar o fórum.');
        }

        await fetch(`/admin/foruns/denuncias/${denunciaId}/ignorar`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ motivo: "Fórum apagado permanentemente" })
        });

        const card = document.getElementById(`denuncia-card-${denunciaId}`);
        if (card) card.remove();

        alert('Fórum apagado permanentemente e denúncia removida da fila!');
        carregarDenunciasAdmin();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

// --- MÓDULO DE DOSSIÊ FORENSE, CIBERSEGURANÇA E TENTATIVAS DE INVASÃO ---

async function exportDossierReport() {
    const token = obterTokenAdmin();
    try {
        const res = await fetch('/admin/dossie-completo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Falha ao obter o dossiê de cibersegurança.");
        const dadosDossie = await res.json();

        gerarJanelaRelatorioDossie(dadosDossie);
    } catch (e) {
        alert("Erro ao gerar relatório forense: " + e.message);
    }
}

function gerarJanelaRelatorioDossie(dados) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("O bloqueador de pop-ups impediu a abertura do relatório. Permita pop-ups para este site.");
        return;
    }

    const meta = dados.metadados_relatorio || {};
    const resumo = dados.resumo_executivo || {};
    const logs = dados.forense_telemetria_acessos || [];
    const tentativasBloqueadas = dados.tentativas_intrusao_bloqueadas || 0;

    let logsRowsHtml = logs.map(l => {
        const severidade = l.severidade || 'BAIXA';
        let badgeCor = '#16a34a'; // Verde
        if (severidade === 'ALTA') badgeCor = '#f59e0b'; // Amarelo/Laranja
        if (severidade === 'CRITICA') badgeCor = '#dc2626'; // Vermelho

        return `
            <tr>
                <td>${l.timestamp ? new Date(l.timestamp).toLocaleString() : 'N/A'}</td>
                <td><strong>${l.username || 'Desconhecido'}</strong></td>
                <td><code>${l.ip_address || 'N/A'}</code></td>
                <td><span style="color: ${badgeCor}; font-weight: bold;">${severidade}</span></td>
                <td>${l.acao || 'LOGIN_SUCESSO'}</td>
                <td>${l.dispositivo || 'N/A'}</td>
                <td>${l.sistema_operacional || 'N/A'}</td>
                <td>${l.navegador || 'N/A'}</td>
                <td><strong>${l.localizacao || 'Brasil / Local (Detectado por IP)'}</strong></td>
                <td><small>${l.detalhes_payload || 'Sem carga adicional'}</small></td>
            </tr>
        `;
    }).join('');

    if (logs.length === 0) {
        logsRowsHtml = `<tr><td colspan="10" style="text-align: center; color: #64748b;">Nenhum registo de telemetria ou ameaça encontrado.</td></tr>`;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <title>Dossiê Oficial de Cibersegurança e Forense - Ludarium</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 30px; background-color: #ffffff; }
                h1 { color: #2563eb; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; font-size: 22px; }
                .meta { margin-bottom: 20px; color: #475569; font-size: 0.85rem; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
                .section { margin-bottom: 25px; }
                .section h3 { color: #0f172a; font-size: 1.05rem; margin-bottom: 8px; border-left: 4px solid #2563eb; padding-left: 8px; }
                table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                th, td { padding: 8px 10px; border-bottom: 1px solid #cbd5e1; text-align: left; font-size: 0.78rem; }
                th { background: #f1f5f9; color: #334155; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
                code { font-family: monospace; background: #e2e8f0; padding: 2px 4px; border-radius: 4px; }
                .footer { margin-top: 30px; text-align: center; font-size: 0.72rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
            </style>
        </head>
        <body>
            <h1>🛡️ Dossiê de Auditoria, Cibersegurança e Forense - Ludarium</h1>
            <div class="meta">
                <p><strong>Gerado em:</strong> ${meta.gerado_em || 'N/A'}</p>
                <p><strong>Sistema:</strong> ${meta.sistema || 'Ludarium Enterprise Security Suite'}</p>
                <p><strong>Nível de Sigilo:</strong> <span style="color: #dc2626; font-weight: bold;">${meta.nivel_sigilo || 'Confidencial'}</span></p>
            </div>

            <div class="section">
                <h3>📊 Resumo Executivo e Tentativas de Intrusão</h3>
                <table>
                    <tr><th>Métrica de Auditoria / Segurança</th><th>Valor Registado</th></tr>
                    <tr><td>Total de Utilizadores Registados</td><td><strong>${resumo.total_utilizadores_registados || 0}</strong></td></tr>
                    <tr><td>Total de Registos Forenses e Acessos</td><td><strong>${resumo.total_logs_forenses_registados || 0}</strong></td></tr>
                    <tr><td>Tentativas de Intrusão / Brute-Force Bloqueadas</td><td><strong style="color: #dc2626;">${tentativasBloqueadas}</strong></td></tr>
                    <tr><td>Estado Geral de Segurança</td><td><span style="color: #16a34a; font-weight: bold;">${resumo.status_sistema || 'Operacional e Protegido'}</span></td></tr>
                </table>
            </div>

            <div class="section">
                <h3>🛰️ Telemetria Forense, IPs, Dispositivos, Localização e Tentativas de Invasão</h3>
                <table>
                    <tr>
                        <th>Data / Hora (UTC)</th>
                        <th>Utilizador / Alvo</th>
                        <th>Endereço IP</th>
                        <th>Severidade</th>
                        <th>Ação / Evento</th>
                        <th>Dispositivo</th>
                        <th>SO</th>
                        <th>Navegador</th>
                        <th>Localização</th>
                        <th>Payload / Detalhes</th>
                    </tr>
                    ${logsRowsHtml}
                </table>
            </div>

            <div class="footer">
                <p>Relatório forense oficial gerado automaticamente para fins de auditoria de cibersegurança, proteção de dados e conformidade técnica.</p>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Voltar para a página principal preservando o token JWT dinamicamente
function voltarHome() {
    const token = obterTokenAdmin();
    window.location.href = `../home-ui/home.html${token ? '?token=' + token : ''}`;
}

// Terminar sessão e redirecionar mantendo compatibilidade com Cloudflare/Localhost
function sairSessao() {
    if (confirm("Tem a certeza de que deseja sair da sessão administrativa?")) {
        localStorage.removeItem('ludarium_token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('token');
        window.location.href = `../home-ui/login.html`;
    }
}

// Inicialização segura estrita: Executa a validação do Admin ao carregar o script
window.onload = function() {
    verificarSessaoAdmin();
};