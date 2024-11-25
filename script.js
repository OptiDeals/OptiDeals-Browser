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
        
        // Initialize slider value and background
        const slider = document.getElementById('max-cost');
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
    const maxCost = parseFloat(document.getElementById('max-cost').value);
    const selectedStore = document.getElementById('store-filter').value;
    
    let query = `
        SELECT COUNT(*) as total
        FROM recipes
        WHERE recipe_total_cost <= ${maxCost}
    `;
    
    if (selectedStore) {
        query += ` AND recipe_store = '${selectedStore}'`;
    }
    
    // If maxCost is 0, ensure no recipes are shown
    if (maxCost === 0) {
        query += ` AND 1=0`;
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
        const maxCost = parseFloat(document.getElementById('max-cost').value);
        const selectedStore = document.getElementById('store-filter').value;
        
        let query = `
            SELECT 
                id,
                recipe_title,
                recipe_total_cost,
                recipe_store,
                recipe_serving_size
            FROM recipes
            WHERE recipe_total_cost <= ${maxCost}
        `;
        
        if (selectedStore) {
            query += ` AND recipe_store = '${selectedStore}'`;
        }
        
        // If maxCost is 0, ensure no recipes are shown
        if (maxCost === 0) {
            query += ` AND 1=0`;
        }
        
        query += `
            ORDER BY recipe_date ASC
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
                store: row[3],
                servingSize: row[4]
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
                <p class="serving-size">Serves: ${recipe.servingSize || 'N/A'}</p>
                <button class="view-ingredients">View Ingredients</button>
                <div class="recipe-id">ID: ${recipe.id}</div>
            </div>
        `;
        
        recipeList.appendChild(recipeElement);
        loadRecipeImage(recipe.id, recipeElement);
    });

    // Add event listeners for image click
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const closeModal = document.querySelector('.close');

    // Ensure image modal is hidden initially
    imageModal.style.display = 'none';

    recipeList.addEventListener('click', function(e) {
        if (e.target.tagName === 'IMG') {
            imageModal.style.display = 'flex'; // Show modal
            modalImg.src = e.target.src; // Set image source
        }
    });

    closeModal.onclick = function() {
        imageModal.style.display = 'none'; // Hide modal
    };

    window.onclick = function(event) {
        if (event.target === imageModal) {
            imageModal.style.display = 'none'; // Hide modal if clicked outside
        }
    };
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
                imgElement.style.cursor = 'pointer'; // Indicate clickable

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

document.addEventListener('DOMContentLoaded', function() {
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const closeModal = document.querySelector('.close');
    const recipeList = document.getElementById('recipe-list');

    const ingredientsModal = document.getElementById('ingredients-modal');
    const closeIngredients = document.querySelector('.close-ingredients');

    // Ensure both modals are hidden initially
    imageModal.style.display = 'none';
    ingredientsModal.style.display = 'none';

    // Image modal logic
    recipeList.addEventListener('click', function(e) {
        if (e.target.tagName === 'IMG') {
            imageModal.style.display = 'flex'; // Show image modal
            modalImg.src = e.target.src; // Set image source
        }
    });

    closeModal.onclick = function() {
        imageModal.style.display = 'none'; // Hide image modal
    };

    window.onclick = function(event) {
        if (event.target === imageModal) {
            imageModal.style.display = 'none'; // Hide image modal if clicked outside
        }
    };

    // Ingredients modal logic
    document.addEventListener('click', async function(e) {
        if (e.target.classList.contains('view-ingredients')) {
            const recipeId = e.target.closest('.recipe-item').querySelector('.recipe-id').textContent.split(': ')[1];
            const ingredients = await fetchIngredients(recipeId);
            showIngredientsModal(ingredients);
        }
    });

    closeIngredients.onclick = function() {
        ingredientsModal.style.display = 'none'; // Hide ingredients modal
    };

    window.onclick = function(event) {
        if (event.target === ingredientsModal) {
            ingredientsModal.style.display = 'none'; // Hide ingredients modal if clicked outside
        }
    };
});

async function fetchIngredients(recipeId) {
    try {
        const results = db.exec(`
            SELECT recipe_ingredient, recipe_ingredient_amount, recipe_ingredient_cost
            FROM recipe_ingredients
            WHERE recipe_id = ${recipeId}
        `);

        if (results.length > 0 && results[0].values.length > 0) {
            return results[0].values.map(row => ({
                ingredient: row[0],
                amount: row[1],
                cost: row[2]
            }));
        }
    } catch (error) {
        console.error('Error fetching ingredients:', error);
    }
    return [];
}

function showIngredientsModal(ingredients) {
    const modal = document.getElementById('ingredients-modal');
    const modalContent = document.getElementById('ingredients-modal-content');
    modalContent.innerHTML = ''; // Clear previous content

    const title = document.createElement('h2');
    title.textContent = 'Recipe Ingredients';
    modalContent.appendChild(title);

    if (ingredients.length > 0) {
        const table = document.createElement('table');
        table.className = 'ingredients-table';
        
        // Add table header
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Ingredient</th>
                    <th>Amount</th>
                    <th>Cost</th>
                </tr>
            </thead>
            <tbody>
                ${ingredients.map(ing => `
                    <tr>
                        <td>${ing.ingredient}</td>
                        <td>${ing.amount}</td>
                        <td>$${ing.cost.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        
        modalContent.appendChild(table);

        // Add total cost
        const total = ingredients.reduce((sum, ing) => sum + ing.cost, 0);
        const totalElement = document.createElement('div');
        totalElement.className = 'ingredients-total';
        totalElement.textContent = `Total Cost: $${total.toFixed(2)}`;
        modalContent.appendChild(totalElement);
    } else {
        modalContent.innerHTML += `
            <p style="text-align: center; color: var(--text-color);">
                No ingredients found for this recipe.
            </p>
        `;
    }

    modal.style.display = 'flex';
} 