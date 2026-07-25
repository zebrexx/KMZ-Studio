// ========================================
// KMZ STUDIO
// Importação e visualização de arquivos KML e KMZ
// ========================================


// ========================================
// 1. MAPA
// ========================================

const map = L.map("map", {
    zoomControl: false
}).setView(
    [-23.5505, -46.6333],
    11
);

L.control.zoom({
    position: "bottomright"
}).addTo(map);

L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);

window.addEventListener("load", () => {
    setTimeout(() => {
        map.invalidateSize();
    }, 500);
});


// ========================================
// 2. ELEMENTOS DA INTERFACE
// ========================================

const importButton =
    document.getElementById("import-button");

const fileInput =
    document.getElementById("file-input");

const collapseButton =
    document.getElementById("collapse-sidebar");

const sidebar =
    document.querySelector(".sidebar");

const detailsPanel =
    document.querySelector(".details-panel");

const detailsCloseButton =
    document.querySelector(".details-header button");

const detailsContent =
    document.querySelector(".details-empty");

const searchInput =
    document.getElementById("route-search");

const routeList =
    document.querySelector(".route-list");

const legendPanel =
    document.querySelector(".legend-panel");


// ========================================
// 3. DADOS DAS ROTAS
// ========================================

const routes = [];

let selectedRouteId = null;

const NORMAL_LINE_WEIGHT = 2.8;
const HOVER_LINE_WEIGHT = 2.8;
const SELECTED_LINE_WEIGHT = 2.8;

const routeColors = [
    "#3b82f6",
    "#ef4444",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#06b6d4",
    "#f97316",
    "#ec4899",
    "#84cc16",
    "#6366f1"
];


// ========================================
// 4. ABRIR SELETOR DE ARQUIVOS
// ========================================

importButton.addEventListener("click", () => {
    fileInput.click();
});


// ========================================
// 5. RECEBER ARQUIVOS
// ========================================

fileInput.addEventListener("change", async () => {
    const selectedFiles =
        Array.from(fileInput.files);

    if (selectedFiles.length === 0) {
        return;
    }

    importButton.disabled = true;
    importButton.textContent = "Importando...";

    for (const file of selectedFiles) {
        const extension =
            getFileExtension(file.name);

        try {
            if (extension === "kml") {
                await importKmlFile(file);
            } else if (extension === "kmz") {
                await importKmzFile(file);
            } else {
                alert(
                    `"${file.name}" não é um arquivo KML ou KMZ.`
                );
            }
        } catch (error) {
            console.error(
                `Erro ao importar ${file.name}:`,
                error
            );

            alert(
                `Não foi possível importar "${file.name}".\n\n` +
                error.message
            );
        }
    }

    importButton.disabled = false;
    importButton.innerHTML = `
        <span class="import-icon">＋</span>
        Importar KML / KMZ
    `;

    fileInput.value = "";
});


// ========================================
// 6. IMPORTAR ARQUIVO KML
// ========================================

async function importKmlFile(file) {
    const kmlText =
        await file.text();

    processKmlText(
        kmlText,
        file.name,
        file.name
    );
}


// ========================================
// 7. IMPORTAR ARQUIVO KMZ
// ========================================

async function importKmzFile(file) {
    if (typeof JSZip === "undefined") {
        throw new Error(
            "A biblioteca JSZip não foi carregada."
        );
    }

    const zip =
        await JSZip.loadAsync(file);

    const kmlFiles = [];

    zip.forEach((relativePath, zipEntry) => {
        const extension =
            getFileExtension(relativePath);

        if (
            !zipEntry.dir &&
            extension === "kml"
        ) {
            kmlFiles.push(zipEntry);
        }
    });

    if (kmlFiles.length === 0) {
        throw new Error(
            "Nenhum arquivo KML foi encontrado dentro do KMZ."
        );
    }

    const principalKml =
        selectMainKmlFile(kmlFiles);

    const kmlText =
        await principalKml.async("text");

    processKmlText(
        kmlText,
        file.name,
        principalKml.name
    );
}


// ========================================
// 8. ESCOLHER O KML PRINCIPAL DO KMZ
// ========================================

function selectMainKmlFile(kmlFiles) {
    const docKml =
        kmlFiles.find((entry) => {
            const fileName =
                entry.name
                    .split("/")
                    .pop()
                    .toLowerCase();

            return fileName === "doc.kml";
        });

    if (docKml) {
        return docKml;
    }

    const rootKml =
        kmlFiles.find((entry) => {
            return !entry.name.includes("/");
        });

    if (rootKml) {
        return rootKml;
    }

    return kmlFiles[0];
}


// ========================================
// 9. PROCESSAR TEXTO KML
// ========================================

function processKmlText(
    kmlText,
    originalFileName,
    internalFileName
) {
    const parser =
        new DOMParser();

    const kmlDocument =
        parser.parseFromString(
            kmlText,
            "text/xml"
        );

    const parserError =
        kmlDocument.querySelector(
            "parsererror"
        );

    if (parserError) {
        throw new Error(
            "O conteúdo KML está inválido."
        );
    }

    const routeData =
        extractRouteFromKml(
            kmlDocument,
            originalFileName
        );

    if (routeData.lines.length === 0) {
        throw new Error(
            "Nenhum trajeto LineString foi encontrado."
        );
    }

    routeData.internalFileName =
        internalFileName;

    addRouteToMap(routeData);
}


// ========================================
// 10. EXTRAIR DADOS DO KML
// ========================================

function extractRouteFromKml(
    kmlDocument,
    fileName
) {
    const lines = [];

    const lineStrings =
        kmlDocument.getElementsByTagNameNS(
            "*",
            "LineString"
        );

    for (const lineString of lineStrings) {
        const coordinatesElement =
            lineString.getElementsByTagNameNS(
                "*",
                "coordinates"
            )[0];

        if (!coordinatesElement) {
            continue;
        }

        const coordinates =
            parseCoordinates(
                coordinatesElement.textContent
            );

        if (coordinates.length >= 2) {
            lines.push(coordinates);
        }
    }

    let routeName =
        removeFileExtension(fileName);

    const documentElement =
        kmlDocument.getElementsByTagNameNS(
            "*",
            "Document"
        )[0];

    if (documentElement) {
        const directName =
            getDirectChildText(
                documentElement,
                "name"
            );

        if (directName) {
            routeName = directName;
        }
    }

    if (!routeName) {
        routeName =
            removeFileExtension(fileName);
    }

    const subtitle =
        extractRouteSubtitle(
            kmlDocument,
            routeName,
            fileName
        );

    return {
        name: routeName,
        subtitle: subtitle,
        fileName: fileName,
        internalFileName: null,
        lines: lines
    };
}


// ========================================
// 11. EXTRAIR TEXTO SECUNDÁRIO
// ========================================

function extractRouteSubtitle(
    kmlDocument,
    routeName,
    fileName
) {
    const documentElement =
        kmlDocument.getElementsByTagNameNS(
            "*",
            "Document"
        )[0];

    if (documentElement) {
        const description =
            getDirectChildText(
                documentElement,
                "description"
            );

        const cleanDescription =
            cleanKmlText(description);

        if (
            cleanDescription &&
            cleanDescription.toLowerCase() !==
                routeName.toLowerCase()
        ) {
            return truncateText(
                cleanDescription,
                90
            );
        }
    }

    const folders =
        kmlDocument.getElementsByTagNameNS(
            "*",
            "Folder"
        );

    for (const folder of folders) {
        const folderName =
            getDirectChildText(
                folder,
                "name"
            );

        const cleanFolderName =
            cleanKmlText(folderName);

        if (
            cleanFolderName &&
            cleanFolderName.toLowerCase() !==
                routeName.toLowerCase()
        ) {
            return truncateText(
                cleanFolderName,
                90
            );
        }
    }

    return fileName;
}


// ========================================
// 12. OBTER FILHO DIRETO DO XML
// ========================================

function getDirectChildText(
    parentElement,
    tagName
) {
    for (
        const child of parentElement.children
    ) {
        if (
            child.localName === tagName
        ) {
            return child.textContent.trim();
        }
    }

    return "";
}


// ========================================
// 13. CONVERTER COORDENADAS
// ========================================

function parseCoordinates(
    coordinatesText
) {
    return coordinatesText
        .trim()
        .split(/\s+/)
        .map((coordinate) => {
            const parts =
                coordinate.split(",");

            const longitude =
                Number(parts[0]);

            const latitude =
                Number(parts[1]);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ) {
                return null;
            }

            return [
                latitude,
                longitude
            ];
        })
        .filter(
            (coordinate) =>
                coordinate !== null
        );
}


// ========================================
// 14. ADICIONAR ROTA AO MAPA
// ========================================

function addRouteToMap(routeData) {
    const routeId =
        `route-${Date.now()}-${routes.length}`;

    const color =
        routeColors[
            routes.length %
            routeColors.length
        ];

    const layerGroup =
        L.featureGroup();

    const routeLines = [];

    let totalDistance = 0;
    let totalPoints = 0;

    routeData.lines.forEach(
        (coordinates) => {
            const routeLine =
                L.polyline(
                    coordinates,
                    {
                        color: color,
                        weight:
                            NORMAL_LINE_WEIGHT,
                        opacity: 0.74,
                        lineCap: "round",
                        lineJoin: "round"
                    }
                );

            routeLine.on("click", () => {
                selectRoute(
                    routeId,
                    {
                        fitBounds: false
                    }
                );
            });

            routeLine.on(
                "mouseover",
                () => {
                    if (
                        selectedRouteId !==
                        routeId
                    ) {
                        routeLine.setStyle({
                            weight:
                                HOVER_LINE_WEIGHT,
                            opacity: 0.92
                        });
                    }
                }
            );

            routeLine.on(
                "mouseout",
                () => {
                    applyRouteVisualState(
                        routeId
                    );
                }
            );

            routeLine.addTo(layerGroup);
            routeLines.push(routeLine);

            totalDistance +=
                calculateLineDistance(
                    coordinates
                );

            totalPoints +=
                coordinates.length;
        }
    );

    layerGroup.addTo(map);

    const route = {
        id: routeId,
        name: routeData.name,
        subtitle: routeData.subtitle,
        fileName: routeData.fileName,
        internalFileName:
            routeData.internalFileName,
        fileType:
            getFileExtension(
                routeData.fileName
            ).toUpperCase(),
        color: color,
        layer: layerGroup,
        lines: routeLines,
        visible: true,
        distance: totalDistance,
        segmentCount:
            routeData.lines.length,
        pointCount: totalPoints
    };

    routes.push(route);

    createRouteListItem(route);
    updateEmptyState();

    const bounds =
        layerGroup.getBounds();

    if (bounds.isValid()) {
        map.fitBounds(
            bounds,
            {
                padding: [70, 70]
            }
        );
    }

    selectRoute(
        routeId,
        {
            fitBounds: false
        }
    );
}


// ========================================
// 15. CRIAR ITEM NA LISTA
// ========================================

function createRouteListItem(route) {
    const routeItem =
        document.createElement("div");

    routeItem.className =
        "route-item";

    routeItem.dataset.routeId =
        route.id;

        routeItem.title =
    `${route.name} — ${route.subtitle}`;

    routeItem.dataset.routeName =
        `${route.name} ${route.subtitle} ${route.fileName}`
            .toLowerCase();

    routeItem.style.setProperty(
        "--route-color",
        route.color
    );

    routeItem.innerHTML = `
        <div class="route-checkbox-area">
            <input
                type="checkbox"
                class="route-visibility"
                checked
                title="Mostrar ou ocultar rota"
                aria-label="Mostrar ou ocultar rota"
            >

            <span
                class="route-color"
                style="background: ${route.color};"
            ></span>

            <span class="route-item-text">
                <strong>
                    ${escapeHtml(route.name)}
                </strong>

                <small>
                    ${escapeHtml(route.subtitle)}
                </small>
            </span>
        </div>

        <button class="delete-route-button" title="Excluir rota">
    &times;
</button>
    `;

    routeItem.addEventListener(
        "click",
        (event) => {
            if (
                event.target.closest(
                    ".route-visibility"
                ) ||
                event.target.closest(
                    ".delete-route-button"
                )
            ) {
                return;
            }

            selectRoute(
                route.id,
                {
                    fitBounds: true
                }
            );
        }
    );

    const checkbox =
    routeItem.querySelector(
        ".route-visibility"
    );

checkbox.addEventListener(
    "click",
    (event) => {
        event.stopPropagation();
    }
);

checkbox.addEventListener(
    "change",
    () => {
        setRouteVisibility(
            route.id,
            checkbox.checked
        );
    }
);

const deleteButton =
    routeItem.querySelector(
        ".delete-route-button"
    );

deleteButton.addEventListener(
    "click",
    (event) => {
        event.stopPropagation();
        deleteRoute(route.id);
    }
);

routeList.appendChild(
    routeItem
);
}


// ========================================
// 16. SELECIONAR ROTA
// ========================================

function selectRoute(
    routeId,
    options = {}
) {
    const route =
        routes.find(
            (item) =>
                item.id === routeId
        );

    if (!route) {
        return;
    }

    selectedRouteId = routeId;

    document
        .querySelectorAll(
            ".route-item"
        )
        .forEach((item) => {
            item.classList.toggle(
                "selected",
                item.dataset.routeId ===
                    routeId
            );
        });

    routes.forEach((item) => {
        applyRouteVisualState(
            item.id
        );
    });

    showRouteDetails(routeId);
    updateLegend();

    if (
        options.fitBounds &&
        route.visible
    ) {
        const bounds =
            route.layer.getBounds();

        if (bounds.isValid()) {
            map.fitBounds(
                bounds,
                {
                    padding: [70, 70]
                }
            );
        }
    }
}


// ========================================
// 17. ESTILO VISUAL DAS LINHAS
// ========================================

function applyRouteVisualState(
    routeId
) {
    const route =
        routes.find(
            (item) =>
                item.id === routeId
        );

    if (!route) {
        return;
    }

    const isSelected =
        selectedRouteId === routeId;

    route.lines.forEach(
        (line) => {
            line.setStyle({
                weight: isSelected
                    ? SELECTED_LINE_WEIGHT
                    : NORMAL_LINE_WEIGHT,
                opacity: isSelected
                    ? 0.96
                    : 0.74
            });

            if (isSelected) {
                line.bringToFront();
            }
        }
    );
}


// ========================================
// 18. MOSTRAR OU OCULTAR ROTA
// ========================================

function setRouteVisibility(
    routeId,
    visible
) {
    const route =
        routes.find(
            (item) =>
                item.id === routeId
        );

    if (!route) {
        return;
    }

    route.visible = visible;

    if (visible) {
        route.layer.addTo(map);
        applyRouteVisualState(routeId);
    } else {
        map.removeLayer(route.layer);
    }

    if (
    selectedRouteId === routeId
) {
    showRouteDetails(routeId);
}

updateLegend();
    
}


// ========================================
// 19. EXCLUIR ROTA
// ========================================

function deleteRoute(routeId) {
    const routeIndex =
        routes.findIndex(
            (item) =>
                item.id === routeId
        );

    if (routeIndex === -1) {
        return;
    }

    const route =
        routes[routeIndex];

    if (map.hasLayer(route.layer)) {
        map.removeLayer(route.layer);
    }

    routes.splice(
        routeIndex,
        1
    );

    const routeItem =
        document.querySelector(
            `[data-route-id="${routeId}"]`
        );

    if (routeItem) {
        routeItem.remove();
    }

    if (
    selectedRouteId === routeId
) {
    selectedRouteId = null;

    detailsPanel.classList.add(
        "hidden"
    );

    detailsContent.innerHTML =
        "Selecione uma linha para ver suas informações.";
}

updateLegend();
updateEmptyState();
}


// ========================================
// 20. DETALHES DA ROTA
// ========================================

function showRouteDetails(routeId) {
    const route =
        routes.find(
            (item) =>
                item.id === routeId
        );

    if (!route) {
        return;
    }

    detailsPanel.classList.remove(
        "hidden"
    );

    const internalFileInformation =
        route.fileType === "KMZ"
            ? `
                <div class="details-information">
                    <span>KML interno</span>
                    <strong>
                        ${escapeHtml(
                            route.internalFileName
                        )}
                    </strong>
                </div>
            `
            : "";

    detailsContent.innerHTML = `
        <div class="route-details-content">
            <div
                class="details-route-color"
                style="background: ${route.color};"
            ></div>

            <h3>
                ${escapeHtml(route.name)}
            </h3>

            <div class="details-information">
                <span>Arquivo</span>
                <strong>
                    ${escapeHtml(route.fileName)}
                </strong>
            </div>

            <div class="details-information">
                <span>Formato</span>
                <strong>
                    ${route.fileType}
                </strong>
            </div>

            <div class="details-information">
                <span>Extensão aproximada</span>
                <strong>
                    ${formatDistance(
                        route.distance
                   )}
                </strong>
            </div>

            <div class="details-information">
                <span>Trechos encontrados</span>
                <strong>
                    ${route.segmentCount}
                </strong>
        </div>
        </div>
    `;
}


// ========================================
// 21. CALCULAR DISTÂNCIA
// ========================================

function calculateLineDistance(
    coordinates
) {
    let distance = 0;

    for (
        let index = 1;
        index < coordinates.length;
        index++
    ) {
        distance += map.distance(
            coordinates[index - 1],
            coordinates[index]
        );
    }

    return distance;
}

function formatDistance(
    distanceInMeters
) {
    if (distanceInMeters < 1000) {
        return `${Math.round(
            distanceInMeters
        )} m`;
    }

    return `${(
        distanceInMeters / 1000
    ).toFixed(2)} km`;
}


// ========================================
// 22. LEGENDA
// ========================================

function updateLegend() {
    const visibleRoutes = routes.filter(
        (route) => route.visible
    );

    if (visibleRoutes.length === 0) {
        legendPanel.innerHTML = "";
        legendPanel.classList.add("hidden");
        return;
    }

    legendPanel.innerHTML = visibleRoutes
        .map(
            (route) => `
                <div class="legend-item">
                    <span
                        class="legend-color"
                        style="background: ${route.color};"
                    ></span>

                    <span>
                        ${escapeHtml(route.name)}
                    </span>
                </div>
            `
        )
        .join("");

    legendPanel.classList.remove("hidden");
}

// ========================================
// 23. ESTADO VAZIO
// ========================================

function updateEmptyState() {
    const emptyState =
        routeList.querySelector(
            ".empty-state"
        );

    if (!emptyState) {
        return;
    }

    emptyState.style.display =
        routes.length === 0
            ? "flex"
            : "none";
}


// ========================================
// 24. PESQUISA
// ========================================

searchInput.addEventListener(
    "input",
    () => {
        const searchTerm =
            searchInput.value
                .trim()
                .toLowerCase();

        document
            .querySelectorAll(
                ".route-item"
            )
            .forEach(
                (routeItem) => {
                    const routeName =
                        routeItem.dataset
                            .routeName;

                    const shouldShow =
                        routeName.includes(
                            searchTerm
                        );

                    routeItem.style.display =
                        shouldShow
                            ? "flex"
                            : "none";
                }
            );
    }
);


// ========================================
// 25. PAINEL ESQUERDO
// ========================================

collapseButton.addEventListener(
    "click",
    () => {
        sidebar.classList.toggle(
            "collapsed"
        );

        const isCollapsed =
            sidebar.classList.contains(
                "collapsed"
            );

        document.body.classList.toggle(
            "sidebar-collapsed",
            isCollapsed
        );

        if (isCollapsed) {
            collapseButton.textContent =
                "›";

            collapseButton.title =
                "Abrir painel";

            collapseButton.setAttribute(
                "aria-label",
                "Abrir painel lateral"
            );
        } else {
            collapseButton.textContent =
                "‹";

            collapseButton.title =
                "Recolher painel";

            collapseButton.setAttribute(
                "aria-label",
                "Recolher painel lateral"
            );
        }

        setTimeout(() => {
            map.invalidateSize();
        }, 310);
    }
);


// ========================================
// 26. PAINEL DIREITO
// ========================================

detailsCloseButton.addEventListener(
    "click",
    () => {
        detailsPanel.classList.add(
            "hidden"
        );
    }
);


// ========================================
// 27. FUNÇÕES AUXILIARES
// ========================================

function getFileExtension(fileName) {
    const cleanFileName =
        fileName
            .split("?")[0]
            .split("#")[0];

    const parts =
        cleanFileName.split(".");

    if (parts.length < 2) {
        return "";
    }

    return parts
        .pop()
        .toLowerCase();
}

function removeFileExtension(fileName) {
    return fileName.replace(
        /\.[^/.]+$/,
        ""
    );
}

function cleanKmlText(text) {
    if (!text) {
        return "";
    }

    const temporaryElement =
        document.createElement("div");

    temporaryElement.innerHTML =
        text;

    return temporaryElement.textContent
        .replace(/\s+/g, " ")
        .trim();
}

function truncateText(
    text,
    maximumLength
) {
    if (
        text.length <= maximumLength
    ) {
        return text;
    }

    return `${text.slice(
        0,
        maximumLength - 1
    ).trim()}…`;
}

function escapeHtml(text) {
    const element =
        document.createElement("div");

    element.textContent =
        text ?? "";

    return element.innerHTML;
}


console.log(
    "KMZ Studio iniciado com suporte a KML e KMZ."
);