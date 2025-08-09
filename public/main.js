let socket = null;
        let currentUser = null;
        let currentDocument = null;
        let token = localStorage.getItem('token');
        let saveTimeout = null;
        let isTyping = false;
        let isReceivingChanges = false;

        // Check if user is already logged in
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp > Date.now() / 1000) {
                    currentUser = payload;
                    showDashboard();
                } else {
                    localStorage.removeItem('token');
                }
            } catch (e) {
                localStorage.removeItem('token');
            }
        }

        // Auth Functions
        function showLoginForm() {
            document.getElementById('loginForm').style.display = 'block';
            document.getElementById('registerForm').style.display = 'none';
            clearMessages();
        }

        function showRegisterForm() {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'block';
            clearMessages();
        }

        function clearMessages() {
            document.getElementById('errorMessage').style.display = 'none';
            document.getElementById('successMessage').style.display = 'none';
        }

        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            document.getElementById('successMessage').style.display = 'none';
        }

        function showSuccess(message) {
            const successDiv = document.getElementById('successMessage');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            document.getElementById('errorMessage').style.display = 'none';
        }

        // Login
        document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                const data = await response.json();

                if (response.ok) {
                    token = data.token;
                    currentUser = data.user;
                    localStorage.setItem('token', token);
                    showSuccess('Login successful!');
                    setTimeout(() => showDashboard(), 1000);
                } else {
                    showError(data.error || 'Login failed');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        });

        // Register
        document.getElementById('registerFormElement').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, email, password }),
                });

                const data = await response.json();

                if (response.ok) {
                    token = data.token;
                    currentUser = data.user;
                    localStorage.setItem('token', token);
                    showSuccess('Registration successful!');
                    setTimeout(() => showDashboard(), 1000);
                } else {
                    showError(data.error || 'Registration failed');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        });

        // Dashboard Functions
        async function showDashboard() {
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            document.getElementById('editorContainer').style.display = 'none';

            // Update user info
            document.getElementById('userName').textContent = currentUser.username;
            document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();

            // Initialize Socket.IO
            if (!socket) {
                socket = io({
                    auth: {
                        token: token
                    }
                });

                socket.on('connect', () => {
                    updateStatus('Connected', 'success');
                });

                socket.on('disconnect', () => {
                    updateStatus('Disconnected', 'error');
                });
                
                // Add the socket event listeners here to avoid re-adding them
                setupSocketListeners();
            }

            // Load documents
            await loadDocuments();
        }

        async function loadDocuments() {
            try {
                const response = await fetch('/api/documents', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const documents = await response.json();
                const grid = document.getElementById('documentsGrid');
                
                // Clear existing documents (keep create button)
                while (grid.children.length > 1) {
                    grid.removeChild(grid.lastChild);
                }

                documents.forEach(doc => {
                    const card = document.createElement('div');
                    card.className = 'document-card';
                    card.onclick = () => openDocument(doc.id);
                    
                    const ownerText = doc.owner_id === currentUser.userId ? 'You' : doc.owner_name;
                    const permissionText = doc.owner_id === currentUser.userId ? '' : `<p><i class="fas fa-user-friends"></i> Shared with you (${doc.permission})</p>`;
                    
                    card.innerHTML = `
                        <h3>${doc.title}</h3>
                        <div class="document-meta">
                            <p><i class="fas fa-user"></i> Owned by: ${ownerText}</p>
                            <p><i class="fas fa-clock"></i> Last updated: ${new Date(doc.updated_at).toLocaleDateString()}</p>
                            <p><i class="fas fa-key"></i> ID: ${doc.id}</p>
                            ${permissionText}
                        </div>
                    `;
                    
                    grid.appendChild(card);
                });
            } catch (error) {
                console.error('Error loading documents:', error);
            }
        }
        
        async function openSharedDocument() {
            const documentId = document.getElementById('sharedDocIdInput').value;
            if (documentId) {
                await openDocument(documentId);
            } else {
                alert('Please enter a document ID.');
            }
        }

        // Document Functions
        function showCreateDocumentModal() {
            document.getElementById('createDocumentModal').style.display = 'block';
        }

        function closeCreateDocumentModal() {
            document.getElementById('createDocumentModal').style.display = 'none';
            document.getElementById('newDocumentTitle').value = '';
        }
        
        function showShareDocumentModal() {
            document.getElementById('shareDocumentModal').style.display = 'block';
            loadCurrentCollaborators();
        }

        function closeShareDocumentModal() {
            document.getElementById('shareDocumentModal').style.display = 'none';
            document.getElementById('shareUserInput').value = '';
            document.getElementById('shareMessage').style.display = 'none';
            document.getElementById('shareMessage').classList.remove('share-message-error');
        }

        document.getElementById('createDocumentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('newDocumentTitle').value;

            try {
                const response = await fetch('/api/documents', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ title }),
                });

                const data = await response.json();

                if (response.ok) {
                    closeCreateDocumentModal();
                    openDocument(data.id);
                } else {
                    alert('Error creating document: ' + data.error);
                }
            } catch (error) {
                alert('Network error. Please try again.');
            }
        });

        document.getElementById('shareDocumentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameOrEmail = document.getElementById('shareUserInput').value;
            const permission = document.getElementById('sharePermission').value;

            try {
                const response = await fetch(`/api/documents/${currentDocument.id}/share`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ usernameOrEmail, permission }),
                });

                const data = await response.json();
                
                const shareMessage = document.getElementById('shareMessage');
                shareMessage.style.display = 'block';
                shareMessage.classList.remove('share-message-error');
                shareMessage.textContent = '';

                if (response.ok) {
                    shareMessage.textContent = data.message;
                    document.getElementById('shareUserInput').value = '';
                    loadCurrentCollaborators();
                } else {
                    shareMessage.textContent = data.error || 'Failed to share document.';
                    shareMessage.classList.add('share-message-error');
                }
            } catch (error) {
                const shareMessage = document.getElementById('shareMessage');
                shareMessage.textContent = 'Network error. Please try again.';
                shareMessage.style.display = 'block';
                shareMessage.classList.add('share-message-error');
            }
        });

        async function loadCurrentCollaborators() {
             try {
                const response = await fetch(`/api/documents/${currentDocument.id}/collaborators`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const collaborators = await response.json();
                const list = document.getElementById('currentCollaboratorsList');
                list.innerHTML = '';
                
                collaborators.forEach(collab => {
                    const li = document.createElement('li');
                    li.className = 'collaborator-item';
                    li.innerHTML = `
                        <span>${collab.username}</span>
                        <span>${collab.permission}</span>
                    `;
                    list.appendChild(li);
                });
             } catch (error) {
                console.error('Error loading collaborators:', error);
             }
        }

        async function openDocument(documentId) {
            try {
                const response = await fetch(`/api/documents/${documentId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const document = await response.json();

                if (response.ok) {
                    currentDocument = document;
                    showEditor();
                } else {
                    alert('Error loading document: ' + (document.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Network error. Please try again.');
            }
        }

        function showEditor() {
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('editorContainer').style.display = 'block';

            // Set document content
            document.getElementById('documentTitle').textContent = currentDocument.title;
            document.getElementById('editor').innerHTML = currentDocument.content || '';

            // Check and apply permissions
            const isWritePermission = currentDocument.permission === 'write';
            document.getElementById('editor').contentEditable = isWritePermission;
            document.getElementById('documentTitle').contentEditable = isWritePermission;
            document.getElementById('mainToolbar').style.display = isWritePermission ? 'flex' : 'none';
            document.getElementById('shareButton').style.display = isWritePermission ? 'inline-block' : 'none';

            // Leave any previous document room and join the new one
            if (socket.connected) {
                socket.emit('join-document', currentDocument.id);
            }

            // Load document versions
            loadDocumentVersions();

            // Set up editor event listeners
            setupEditorListeners();
        }

        function setupEditorListeners() {
            const editor = document.getElementById('editor');
            const titleElement = document.getElementById('documentTitle');

            editor.addEventListener('input', () => {
                // Only send updates if the current user has write permission and is not receiving a change
                if (currentDocument.permission === 'write' && !isReceivingChanges) {
                    isTyping = true;
                    updateStatus('Saving...', 'saving');

                    socket.emit('document-change', {
                        documentId: currentDocument.id,
                        content: editor.innerHTML
                    });

                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(async () => {
                        await saveDocument();
                        isTyping = false;
                    }, 2000);
                }
            });

            titleElement.addEventListener('blur', async () => {
                if (currentDocument.permission === 'write') {
                    const newTitle = titleElement.textContent;
                    if (newTitle !== currentDocument.title) {
                        currentDocument.title = newTitle;
                        await saveDocument(newTitle);
                    }
                }
            });

            // Cursor position tracking
            editor.addEventListener('mouseup', () => {
                if (currentDocument.permission === 'write') {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const position = getCaretPosition(editor);
                        socket.emit('cursor-position', {
                            documentId: currentDocument.id,
                            position: position
                        });
                    }
                }
            });
            
            // Re-connect event listener to avoid duplicates
            socket.off('document-change');
            socket.on('document-change', (data) => {
                if (data.userId !== currentUser.userId) {
                    const editor = document.getElementById('editor');
                    // Check if the current editor content is different from the incoming data
                    if (editor.innerHTML !== data.content) {
                         // Temporarily disable sending changes to prevent an infinite loop
                        isReceivingChanges = true;
                        editor.innerHTML = data.content;
                        isReceivingChanges = false;
                    }
                }
            });
        }
        
        function getCaretPosition(element) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const preSelectionRange = range.cloneRange();
                preSelectionRange.selectNodeContents(element);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);
                const start = preSelectionRange.toString().length;
                return { start: start, end: start + range.toString().length };
            }
            return { start: 0, end: 0 };
        }

        async function saveDocument(title = null) {
            try {
                const content = document.getElementById('editor').innerHTML;
                const response = await fetch(`/api/documents/${currentDocument.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        content,
                        title: title
                    }),
                });

                if (response.ok) {
                    updateStatus('Saved', 'success');
                    // Hide status indicator after a short delay
                    setTimeout(() => {
                        if (!isTyping) {
                            document.getElementById('statusIndicator').style.display = 'none';
                        }
                    }, 2000);
                } else {
                    updateStatus('Save failed', 'error');
                }
            } catch (error) {
                updateStatus('Save failed', 'error');
            }
        }

        async function loadDocumentVersions() {
            try {
                const response = await fetch(`/api/documents/${currentDocument.id}/versions`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const versions = await response.json();
                const versionsList = document.getElementById('versionsList');
                versionsList.innerHTML = '';

                versions.forEach((version, index) => {
                    const li = document.createElement('li');
                    li.className = 'version-item';
                    li.onclick = () => loadVersion(version);
                    
                    li.innerHTML = `
                        <div>Version ${version.version_number}</div>
                        <div style="font-size: 0.8rem; color: #94a3b8;">
                            ${version.created_by_name} • ${new Date(version.created_at).toLocaleString()}
                        </div>
                    `;
                    
                    versionsList.appendChild(li);
                });
            } catch (error) {
                console.error('Error loading versions:', error);
            }
        }

        function loadVersion(version) {
            if (confirm(`Load version ${version.version_number} from ${version.created_by_name}? This will replace the current content.`)) {
                document.getElementById('editor').innerHTML = version.content;
                // Force a save after loading a version
                if (currentDocument.permission === 'write') {
                    saveDocument();
                }
            }
        }
        
        function setupSocketListeners() {
            socket.on('document-change', (data) => {
                if (data.userId !== currentUser.userId) {
                    const editor = document.getElementById('editor');
                    isReceivingChanges = true;
                    // Preserve focus and cursor position
                    const selection = window.getSelection();
                    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                    const cursorPosition = range ? getCaretPosition(editor) : null;

                    editor.innerHTML = data.content;

                    // Restore cursor position if possible
                    if (cursorPosition) {
                        setCaratPosition(editor, cursorPosition.start);
                    }
                    isReceivingChanges = false;
                }
            });

            socket.on('user-joined', (user) => {
                updateActiveUsers();
            });

            socket.on('user-left', (user) => {
                updateActiveUsers();
            });

            socket.on('document-users', (users) => {
                updateActiveUsers(users);
            });
        }

        // A helper function to set the caret position, crucial for collaborative editing
        function setCaratPosition(el, pos) {
            const range = document.createRange();
            const sel = window.getSelection();

            function findNodeAndOffset(node, offset, totalLength) {
                for (let i = 0; i < node.childNodes.length; i++) {
                    const child = node.childNodes[i];
                    if (child.nodeType === 3) { // Text node
                        const childLength = child.textContent.length;
                        if (totalLength + childLength >= offset) {
                            range.setStart(child, offset - totalLength);
                            return;
                        }
                        totalLength += childLength;
                    } else {
                        const childLength = child.textContent.length;
                        if (totalLength + childLength >= offset) {
                            findNodeAndOffset(child, offset, totalLength);
                            return;
                        }
                        totalLength += childLength;
                    }
                }
            }

            range.selectNodeContents(el);
            range.collapse(true);

            let totalLength = 0;
            findNodeAndOffset(el, pos, totalLength);
            
            sel.removeAllRanges();
            sel.addRange(range);
        }

        function updateActiveUsers(users = []) {
            const activeUsersContainer = document.getElementById('activeUsers');
            const sidebarUsersContainer = document.getElementById('sidebarUsers');
            
            activeUsersContainer.innerHTML = '';
            sidebarUsersContainer.innerHTML = '';

            // Combine both owner and collaborators into a single list
            const allUsers = [...users, {
                username: currentDocument.owner_name,
                id: currentDocument.owner_id
            }];
            
            const uniqueUsers = Array.from(new Set(allUsers.map(u => u.id)))
                .map(id => allUsers.find(u => u.id === id));
                
            uniqueUsers.forEach(user => {
                // Header active users
                const userIndicator = document.createElement('div');
                userIndicator.className = 'user-indicator online';
                userIndicator.textContent = user.username.charAt(0).toUpperCase();
                userIndicator.title = user.username;
                activeUsersContainer.appendChild(userIndicator);

                // Sidebar users
                const userItem = document.createElement('div');
                userItem.className = 'sidebar-user-item';
                userItem.innerHTML = `
                    <span class="online-dot"></span>
                    <span>${user.username}</span>
                `;
                sidebarUsersContainer.appendChild(userItem);
            });
        }

        // Rich text formatting
        function formatText(command, value = null) {
            if (currentDocument.permission === 'write') {
                document.execCommand(command, false, value);
                document.getElementById('editor').focus();
                // After formatting, immediately emit the change to other users
                socket.emit('document-change', {
                    documentId: currentDocument.id,
                    content: document.getElementById('editor').innerHTML
                });
            }
        }
        
        // Correcting the fontSize command which uses numbers, not px values
        document.querySelectorAll('select.toolbar-btn')[0].onchange = function() {
            formatText('fontSize', this.value);
        };

        function updateStatus(message, type) {
            const indicator = document.getElementById('statusIndicator');
            indicator.textContent = message;
            indicator.className = `status-indicator ${type}`;
            indicator.style.display = 'block';
        }

        function backToDashboard() {
            if (currentDocument) {
                socket.emit('leave-document', currentDocument.id);
            }
            currentDocument = null;
            showDashboard();
        }

        function logout() {
            localStorage.removeItem('token');
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            currentUser = null;
            currentDocument = null;
            
            document.getElementById('authContainer').style.display = 'flex';
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('editorContainer').style.display = 'none';
            
            showLoginForm();
        }

        // Close modals when clicking outside
        window.onclick = function(event) {
            const createModal = document.getElementById('createDocumentModal');
            const shareModal = document.getElementById('shareDocumentModal');
            if (event.target == createModal) {
                closeCreateDocumentModal();
            }
            if (event.target == shareModal) {
                closeShareDocumentModal();
            }
        }

        // Auto-save before leaving
        window.addEventListener('beforeunload', () => {
            if (isTyping && currentDocument && currentDocument.permission === 'write') {
                saveDocument();
            }
        });
