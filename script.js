let db;
let currentPage = 0;
let totalPages = 0;
let isLoading = false;
let hasMoreRecipes = true;
const RECIPES_PER_PAGE = 6;

async function fetchDatabase(sqlPromise) {
    const dataPromise = fetch("https://raw.githubusercontent.com/OptiDeals/OptiDeals-Data/refs/heads/main/data/optideals.db")
        .then(res => res.arrayBuffer());
    const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
    return new SQL.Database(new Uint8Array(buf));
}

async function initializeDB() {
    try {
        const sqlPromise = initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        
        db = await fetchDatabase(sqlPromise);
        await populateStoreFilter();
        await calculateTotalPages();
        loadPage(0);
        
        // Initialize slider value and background with 50
        const slider = document.getElementById('max-cost');
        document.getElementById('cost-value').textContent = '50';
        const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${value}%, #ddd ${value}%, #ddd 100%)`;
        
    } catch (error) {
        console.error('Error initializing database:', error);
        document.getElementById('recipe-list').innerHTML = 
            '<div class="loading">Error loading database. Please try again later.</div>';
    }
}

async function populateStoreFilter() {
    try {
        const results = db.exec(`
            SELECT DISTINCT recipe_store 
            FROM recipes 
            WHERE recipe_store IS NOT NULL
            ORDER BY recipe_store
        `);
        
        if (results.length > 0) {
            const stores = results[0].values.map(row => row[0]);
            const storeFilter = document.getElementById('store-filter');
            stores.forEach(store => {
                const option = document.createElement('option');
                option.value = store;
                option.textContent = store;
                storeFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error populating store filter:', error);
    }
}

async function calculateTotalPages() {
    const maxCost = parseFloat(document.getElementById('max-cost').value) || 100;
    const selectedStore = document.getElementById('store-filter').value;
    
    let query = `
        SELECT COUNT(*) as total
        FROM recipes
        WHERE recipe_total_cost <= ${maxCost}
    `;
    
    if (selectedStore) {
        query += ` AND recipe_store = '${selectedStore}'`;
    }
    
    const results = db.exec(query);
    const totalRecipes = results[0].values[0][0];
    totalPages = Math.ceil(totalRecipes / RECIPES_PER_PAGE);
    updatePaginationControls();
}

function updatePaginationControls() {
    const paginationDiv = document.getElementById('pagination-controls');
    let paginationHTML = `
        <button id="prev-page" ${currentPage === 0 ? 'disabled' : ''}>Previous</button>
    `;
    
    // Add page numbers
    const maxVisiblePages = 5;
    const halfVisible = Math.floor(maxVisiblePages / 2);
    let startPage = Math.max(0, currentPage - halfVisible);
    let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);
    
    // Adjust startPage if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(0, endPage - maxVisiblePages + 1);
    }
    
    // Add first page and ellipsis if needed
    if (startPage > 0) {
        paginationHTML += `
            <button class="page-number" data-page="0">1</button>
            ${startPage > 1 ? '<span>...</span>' : ''}
        `;
    }
    
    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="page-number ${i === currentPage ? 'active' : ''}" 
                    data-page="${i}">${i + 1}</button>
        `;
    }
    
    // Add last page and ellipsis if needed
    if (endPage < totalPages - 1) {
        paginationHTML += `
            ${endPage < totalPages - 2 ? '<span>...</span>' : ''}
            <button class="page-number" data-page="${totalPages - 1}">${totalPages}</button>
        `;
    }
    
    paginationHTML += `
        <button id="next-page" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
    `;
    
    paginationDiv.innerHTML = paginationHTML;
}

async function loadPage(pageNumber) {
    if (pageNumber < 0 || pageNumber >= totalPages) return;
    
    currentPage = pageNumber;
    document.getElementById('recipe-list').innerHTML = '<div class="loading">Loading recipes...</div>';
    
    try {
        const maxCost = parseFloat(document.getElementById('max-cost').value) || 100;
        const selectedStore = document.getElementById('store-filter').value;
        
        let query = `
            SELECT 
                id,
                recipe_title,
                recipe_total_cost,
                recipe_store
            FROM recipes
            WHERE recipe_total_cost <= ${maxCost}
        `;
        
        if (selectedStore) {
            query += ` AND recipe_store = '${selectedStore}'`;
        }
        
        query += `
            ORDER BY recipe_total_cost ASC
            LIMIT ${RECIPES_PER_PAGE}
            OFFSET ${currentPage * RECIPES_PER_PAGE}
        `;
        
        const results = db.exec(query);
        
        document.getElementById('recipe-list').innerHTML = '';
        
        if (results.length > 0 && results[0].values.length > 0) {
            const recipes = results[0].values.map(row => ({
                id: row[0],
                title: row[1],
                totalCost: row[2],
                store: row[3]
            }));
            
            renderRecipes(recipes);
        } else {
            document.getElementById('recipe-list').innerHTML = 
                '<div class="no-results">No recipes found matching your criteria.</div>';
        }
        
        updatePaginationControls();
    } catch (error) {
        console.error('Error loading recipes:', error);
    }
}

function renderRecipes(recipes) {
    const recipeList = document.getElementById('recipe-list');
    
    recipes.forEach(recipe => {
        const recipeElement = document.createElement('div');
        recipeElement.className = 'recipe-item';
        
        recipeElement.innerHTML = `
            <div class="no-image">No Image Available</div>
            <div class="content">
                <h3>${recipe.title}</h3>
                <p class="price">$${recipe.totalCost ? recipe.totalCost.toFixed(2) : '0.00'}</p>
                <p class="store">${recipe.store || 'Unknown'}</p>
            </div>
        `;
        
        recipeList.appendChild(recipeElement);
        loadRecipeImage(recipe.id, recipeElement);
    });
}

async function loadRecipeImage(recipeId, element) {
    try {
        const imageResult = db.exec(`
            SELECT recipe_image 
            FROM recipes 
            WHERE id = ${recipeId} AND recipe_image IS NOT NULL
        `);
        
        if (imageResult.length > 0 && imageResult[0].values.length > 0) {
            const imageData = imageResult[0].values[0][0];
            if (imageData) {
                const blob = new Blob([imageData], { type: 'image/jpeg' });
                const imageUrl = URL.createObjectURL(blob);
                const imgElement = document.createElement('img');
                imgElement.src = imageUrl;
                imgElement.alt = 'Recipe Image';
                
                const noImageDiv = element.querySelector('.no-image');
                if (noImageDiv) {
                    noImageDiv.replaceWith(imgElement);
                }
            }
        }
    } catch (error) {
        console.error('Error loading image for recipe:', recipeId, error);
    }
}

function resetRecipes() {
    currentPage = 0;
    calculateTotalPages();
    loadPage(0);
}

// Event listeners
document.getElementById('max-cost').addEventListener('input', function(e) {
    document.getElementById('cost-value').textContent = e.target.value;
    const value = (e.target.value - e.target.min) / (e.target.max - e.target.min) * 100;
    e.target.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${value}%, #ddd ${value}%, #ddd 100%)`;
    resetRecipes();
});

document.getElementById('store-filter').addEventListener('change', resetRecipes);

document.addEventListener('click', function(e) {
    if (e.target.id === 'next-page') {
        loadPage(currentPage + 1);
    } else if (e.target.id === 'prev-page') {
        loadPage(currentPage - 1);
    } else if (e.target.classList.contains('page-number')) {
        const pageNumber = parseInt(e.target.dataset.page);
        loadPage(pageNumber);
    }
});

// Initialize database when page loads
document.addEventListener('DOMContentLoaded', initializeDB); 