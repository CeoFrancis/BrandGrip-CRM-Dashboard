 // --- Configuration ---
    // !!! IMPORTANT: Replace this with your actual Apps Script Web App URL !!!
    const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw9W4lVcO-lXfdaCeTs1DRMzrDRpmeW-1nJX65EO7PSVkW9FGamsEdAeHSgcU5OrKwrag/exec'; 

    // --- Global State ---
    let ALL_LEADS = [];
    let CURRENT_PAGE = 1;
    const LEADS_PER_PAGE = 10;
    let SORT_COLUMN = 'Date Received';
    let SORT_DIRECTION = 'desc';
    let currentLeadId = null;
    
    // --- Element Access ---
    const modal = document.getElementById('lead-modal');
    const form = document.getElementById('lead-form');
    
    // --- API Communication Functions (using standard Fetch) ---

    /** Executes a standard REST API call to the Apps Script endpoint. */
    async function apiCall(method, action, body = null) {
      const url = `${API_ENDPOINT}?action=${action}`;
      
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error('API Call Failed:', error);
        throw new Error(`Connection Error: ${error.message}. Check the API_ENDPOINT and CORS settings.`);
      }
    }

    // --- Data Fetching and Initialization ---

    async function initDashboard() {
      try {
        showLoading(true);
        // GET request for fetching leads
        const response = await apiCall('GET', 'getLeads');
        
        if (response.success === false) {
             throw new Error(response.data || "Failed to fetch leads.");
        }
        
        ALL_LEADS = response.data || [];
        renderDashboard();
      } catch (e) {
        console.error("Failed to initialize dashboard:", e);
        alert(`Error initializing dashboard: ${e.message}`);
      } finally {
        showLoading(false);
      }
    }
    
    // --- CRUD Operations (API) ---

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = {};
        // Use field IDs as keys, which match Sheet Headers
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }

        const action = currentLeadId ? 'update' : 'add';
        const apiData = currentLeadId ? { id: currentLeadId, data: data } : data;

        try {
            showLoading(true);
            const response = await apiCall('POST', action, apiData);

            if (response.success) {
                alert(`Lead ${action === 'add' ? 'added' : 'updated'} successfully!`);
                closeModal();
                await initDashboard(); // Re-fetch and re-render all data
            } else {
                alert(`Operation failed: ${response.data}`);
            }
        } catch (error) {
            console.error(error);
            alert('An unexpected error occurred during the API call.');
        } finally {
            showLoading(false);
        }
    });

    async function deleteLeadAction(id) {
        if (!confirm('Are you sure you want to delete this lead? This cannot be undone.')) {
            return;
        }

        try {
            showLoading(true);
            const response = await apiCall('POST', 'delete', { id: id });

            if (response.success) {
                alert(`Lead ${id} deleted successfully.`);
                closeModal();
                await initDashboard(); // Re-fetch and re-render all data
            } else {
                alert(`Deletion failed: ${response.data}`);
            }
        } catch (error) {
            console.error(error);
            alert('An unexpected error occurred during deletion.');
        } finally {
            showLoading(false);
        }
    }


    // --- UI/Rendering Functions (Identical to previous version) ---

    function renderDashboard() {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        const filterStage = document.getElementById('filter-stage').value;

        let filteredLeads = ALL_LEADS.filter(lead => {
            const matchesSearch = !searchTerm || 
                                (lead['Client Name'] && lead['Client Name'].toLowerCase().includes(searchTerm)) ||
                                (lead.Email && lead.Email.toLowerCase().includes(searchTerm)) ||
                                (lead.Phone && String(lead.Phone).includes(searchTerm));
            
            const matchesStage = !filterStage || lead['Lead Stage'] === filterStage;
            
            return matchesSearch && matchesStage;
        });

        // Apply sorting
        filteredLeads.sort((a, b) => {
            const aVal = a[SORT_COLUMN];
            const bVal = b[SORT_COLUMN];

            if (SORT_COLUMN === 'Days Since Follow-up' || SORT_COLUMN === 'Order Value (Ksh)') {
                // Numeric sort
                const valA = parseFloat(aVal) || 0;
                const valB = parseFloat(bVal) || 0;
                return SORT_DIRECTION === 'asc' ? valA - valB : valB - valA;
            } else {
                // String/Date sort
                const valA = String(aVal || '').toLowerCase();
                const valB = String(bVal || '').toLowerCase();
                if (valA < valB) return SORT_DIRECTION === 'asc' ? -1 : 1;
                if (valA > valB) return SORT_DIRECTION === 'asc' ? 1 : -1;
                return 0;
            }
        });

        renderTable(filteredLeads);
        renderPagination(filteredLeads.length);
        renderInsights(filteredLeads);
    }
    
    function renderTable(leads) {
        const tableBody = document.getElementById('lead-table-body');
        tableBody.innerHTML = '';
        
        const start = (CURRENT_PAGE - 1) * LEADS_PER_PAGE;
        const end = start + LEADS_PER_PAGE;
        const leadsToDisplay = leads.slice(start, end);
        
        leadsToDisplay.forEach(lead => {
            const row = tableBody.insertRow();
            row.className = 'hover:bg-gray-50 transition duration-150';

            const getBadgeClass = (stage) => {
                switch (stage) {
                    case 'New': return 'bg-blue-100 text-blue-800';
                    case 'Qualified': return 'bg-yellow-100 text-yellow-800';
                    case 'Offer Sent': return 'bg-indigo-100 text-indigo-800';
                    case 'Won': return 'bg-green-100 text-green-800';
                    case 'Lost': return 'bg-red-100 text-red-800';
                    default: return 'bg-gray-100 text-gray-800';
                }
            };
            
            const getStatusClass = (days) => {
                if (days >= 7) return 'text-red-600 font-bold';
                if (days >= 3) return 'text-yellow-600';
                return 'text-green-600';
            };

            const daysSince = lead['Days Since Follow-up'] || 0;

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${lead['Client Name']} <br>
                    <span class="text-xs text-gray-500">${lead.Email}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getBadgeClass(lead['Lead Stage'])}">
                        ${lead['Lead Stage']}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${lead['Next Follow-up Date'] || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${getStatusClass(daysSince)}">${daysSince} days</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="openEditLeadModal('${lead['Lead ID']}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                    <button onclick="deleteLeadAction('${lead['Lead ID']}')" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            `;
        });
    }

    function sortLeads(column) {
        if (SORT_COLUMN === column) {
            SORT_DIRECTION = SORT_DIRECTION === 'asc' ? 'desc' : 'asc';
        } else {
            SORT_COLUMN = column;
            SORT_DIRECTION = 'asc';
        }
        CURRENT_PAGE = 1; 
        renderDashboard();
    }
    
    document.getElementById('search-input').addEventListener('input', () => {
        CURRENT_PAGE = 1;
        renderDashboard();
    });
    document.getElementById('filter-stage').addEventListener('change', () => {
        CURRENT_PAGE = 1;
        renderDashboard();
    });

    function renderPagination(totalLeads) {
        const totalPages = Math.ceil(totalLeads / LEADS_PER_PAGE);
        const controls = document.getElementById('pagination-controls');
        controls.innerHTML = '';
        
        const createButton = (text, page, isDisabled) => {
            const button = document.createElement('button');
            button.innerText = text;
            button.className = `py-2 px-3 border rounded-lg text-sm transition duration-150 ${
                isDisabled 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-700 hover:bg-gray-200'
            }`;
            button.disabled = isDisabled;
            button.onclick = () => {
                CURRENT_PAGE = page;
                renderDashboard();
            };
            return button;
        };
        
        controls.appendChild(createButton('Previous', CURRENT_PAGE - 1, CURRENT_PAGE === 1));
        
        const pageIndicator = document.createElement('span');
        pageIndicator.innerText = `Page ${CURRENT_PAGE} of ${totalPages}`;
        pageIndicator.className = 'py-2 px-3 text-sm text-gray-700';
        controls.appendChild(pageIndicator);

        controls.appendChild(createButton('Next', CURRENT_PAGE + 1, CURRENT_PAGE === totalPages));
    }

    function renderInsights(leads) {
        const container = document.getElementById('dashboard-insights');
        container.innerHTML = '';

        let totalLeads = leads.length;
        let leadsPerStage = {};
        let revenueProjection = 0;
        
        leads.forEach(lead => {
            const stage = lead['Lead Stage'] || 'Unknown';
            leadsPerStage[stage] = (leadsPerStage[stage] || 0) + 1;
            
            const quotedPrice = parseFloat(lead['Quoted Price']) || 0;
            if (stage === 'Offer Sent') {
                revenueProjection += quotedPrice * 0.5;
            } else if (stage === 'Won') {
                revenueProjection += parseFloat(lead['Order Value (Ksh)']) || quotedPrice;
            }
        });

        const insights = [
            { title: 'Total Active Leads', value: totalLeads, color: 'blue', icon: '👤' },
            { title: 'Leads at Offer Stage', value: leadsPerStage['Offer Sent'] || 0, color: 'indigo', icon: '📝' },
            { title: 'Revenue Projection (Ksh)', value: `Ksh ${revenueProjection.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`, color: 'green', icon: '💰' },
            { title: 'Leads Lost', value: leadsPerStage['Lost'] || 0, color: 'red', icon: '❌' },
        ];

        insights.forEach(item => {
            container.innerHTML += `
                <div class="bg-white shadow-md rounded-xl p-5 border-l-4 border-${item.color}-500 transition duration-300 hover:shadow-lg">
                    <p class="text-sm font-medium text-gray-500">${item.title}</p>
                    <p class="text-2xl font-bold text-gray-800 mt-1">${item.value} <span class="text-lg">${item.icon}</span></p>
                </div>
            `;
        });
    }

    // --- Modal Handlers ---

    function openAddLeadModal() {
        currentLeadId = null;
        form.reset();
        document.getElementById('modal-title').innerText = 'Add New Lead';
        document.getElementById('delete-btn').classList.add('hidden');
        modal.classList.remove('hidden');
    }

    function openEditLeadModal(id) {
        const lead = ALL_LEADS.find(l => String(l['Lead ID']) === String(id));
        if (!lead) return;

        currentLeadId = id;
        document.getElementById('modal-title').innerText = `Edit Lead: ${lead['Client Name']}`;
        document.getElementById('delete-btn').classList.remove('hidden');
        
        // Populate form fields dynamically using Sheet Headers as IDs
        const headers = [
            'Client Name', 'Phone', 'Email', 'Business Type', 'Lead Source', 
            'Product Interested', 'Lead Stage', 'Quoted Price', 
            'Next Follow-up Date', 'Order Value (Ksh)', 'Assigned To', 'Notes'
        ];
        
        headers.forEach(header => {
            const element = document.getElementById(header);
            if (element) {
                element.value = lead[header] || '';
            }
        });

        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
        form.reset();
        currentLeadId = null;
    }

    function showLoading(show) {
      document.body.style.cursor = show ? 'wait' : 'default';
      // Implement a better loading spinner here if desired
    }

    // Initialize the dashboard when the page loads
    window.onload = initDashboard;