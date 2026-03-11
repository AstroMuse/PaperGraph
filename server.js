import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from 'redis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve Vite frontend build in production
app.use(express.static(path.join(__dirname, 'dist')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for PDF uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Keep original name but add timestamp to avoid collisions
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Redis connection
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

// ==========================================
// API Routes: PROJECTS
// ==========================================

// 1. Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const projectsMap = await redisClient.hGetAll('papergraph:projects');
        const projects = Object.values(projectsMap).map(p => JSON.parse(p));
        // Sort by creation date descending
        projects.sort((a, b) => b.createdAt - a.createdAt);
        res.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Create a new project
app.post('/api/projects', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Project name is required' });

        const projectId = `proj_${Math.random().toString(36).substr(2, 9)}`;
        const newProject = {
            id: projectId,
            name,
            description: description || '',
            createdAt: Date.now()
        };

        await redisClient.hSet('papergraph:projects', projectId, JSON.stringify(newProject));
        res.json(newProject);
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. Delete a project and all its nested graph data
app.delete('/api/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;

        // Clean up physically uploaded files for this project's nodes
        const nodesMap = await redisClient.hGetAll(`papergraph:project:${projectId}:nodes`);
        Object.values(nodesMap).forEach(nodeStr => {
            const node = JSON.parse(nodeStr);
            if (node.pdfUrl) {
                try {
                    const filename = node.pdfUrl.split('/uploads/').pop();
                    if (filename) {
                        const filePath = path.join(uploadDir, filename);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    }
                } catch (e) {
                    console.error("Could not delete file:", node.pdfUrl, e);
                }
            }
        });

        // Remove Project Graph Redis keys
        await redisClient.del(`papergraph:project:${projectId}:nodes`);
        await redisClient.del(`papergraph:project:${projectId}:links`);
        
        // Remove Project metadata
        await redisClient.hDel('papergraph:projects', projectId);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// API Routes: GRAPH (Namespaced by Project)
// ==========================================

// Get entire graph data for a specific project
app.get('/api/projects/:projectId/graph', async (req, res) => {
    try {
        const { projectId } = req.params;

        // Verify project exists
        const projectStr = await redisClient.hGet('papergraph:projects', projectId);
        if (!projectStr) return res.status(404).json({ error: 'Project not found' });

        const nodesMap = await redisClient.hGetAll(`papergraph:project:${projectId}:nodes`);
        const nodes = Object.values(nodesMap).map(n => JSON.parse(n));

        const linksSet = await redisClient.sMembers(`papergraph:project:${projectId}:links`);
        const links = linksSet.map(l => JSON.parse(l));

        res.json({ nodes, links });
    } catch (error) {
        console.error('Error fetching graph:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Upload PDF and create a new node in a project
app.post('/api/projects/:projectId/nodes', upload.single('file'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const nodeId = req.body.id || `paper_${Math.random().toString(36).substr(2, 9)}`;
        const originalName = file.originalname.replace('.pdf', '');
        
        // In production, we don't hardcode localhost:3001. We use relative path or request host
        const domain = `${req.protocol}://${req.get('host')}`;
        const pdfUrl = `${domain}/uploads/${file.filename}`;

        const newNode = {
            id: nodeId,
            name: originalName,
            citations: Math.floor(Math.random() * 100),
            pdfUrl: pdfUrl,
            x: parseFloat(req.body.x) || 500, // Default will be handled by UI usually
            y: parseFloat(req.body.y) || 500
        };

        // Save to Redis Hash scoped to project
        await redisClient.hSet(`papergraph:project:${projectId}:nodes`, nodeId, JSON.stringify(newNode));

        res.json(newNode);
    } catch (error) {
        console.error('Error creating node:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update node details in a project
app.put('/api/projects/:projectId/nodes/:id', async (req, res) => {
    try {
        const { projectId, id } = req.params;
        const updates = req.body;

        const existingNodeStr = await redisClient.hGet(`papergraph:project:${projectId}:nodes`, id);
        if (!existingNodeStr) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const updatedNode = { ...JSON.parse(existingNodeStr), ...updates };
        await redisClient.hSet(`papergraph:project:${projectId}:nodes`, id, JSON.stringify(updatedNode));

        res.json(updatedNode);
    } catch (error) {
        console.error('Error updating node:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete node from a project
app.delete('/api/projects/:projectId/nodes/:id', async (req, res) => {
    try {
        const { projectId, id } = req.params;

        // Attempt to remove physical file if we have its URL
        const existingNodeStr = await redisClient.hGet(`papergraph:project:${projectId}:nodes`, id);
        if (existingNodeStr) {
            const node = JSON.parse(existingNodeStr);
            if (node.pdfUrl) {
                try {
                    // Extract filename from the URL, e.g., http://localhost:3001/uploads/16239123-paper.pdf
                    const filename = node.pdfUrl.split('/uploads/').pop();
                    if (filename) {
                        const filePath = path.join(uploadDir, filename);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                } catch (fileErr) {
                    console.error("Could not delete PDF file for node:", id, fileErr);
                }
            }
        }

        // Remove from Redis Hash
        await redisClient.hDel(`papergraph:project:${projectId}:nodes`, id);

        // Remove any links connected to this node
        const linksSet = await redisClient.sMembers(`papergraph:project:${projectId}:links`);
        for (const linkStr of linksSet) {
            const link = JSON.parse(linkStr);
            if (link.source === id || link.target === id) {
                await redisClient.sRem(`papergraph:project:${projectId}:links`, linkStr);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting node:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create link in a project
app.post('/api/projects/:projectId/links', async (req, res) => {
    try {
        const { projectId } = req.params;
        const newLink = req.body; // { source, target, type }
        if (!newLink.source || !newLink.target || !newLink.type) {
            return res.status(400).json({ error: 'Missing source, target, or type' });
        }

        // Add stringified link to Redis Set
        await redisClient.sAdd(`papergraph:project:${projectId}:links`, JSON.stringify(newLink));

        res.json(newLink);
    } catch (error) {
        console.error('Error creating link:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete link from a project
app.delete('/api/projects/:projectId/links', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { source, target } = req.body; // Need source and target to identify

        const linksSet = await redisClient.sMembers(`papergraph:project:${projectId}:links`);
        for (const linkStr of linksSet) {
            const link = JSON.parse(linkStr);
            if ((link.source === source && link.target === target) || (link.source === target && link.target === source)) {
                await redisClient.sRem(`papergraph:project:${projectId}:links`, linkStr);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting link:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Catch-all route to serve React app for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
async function startServer() {
    await redisClient.connect();
    app.listen(port, () => {
        console.log(`Backend server listening on port ${port}`);
    });
}

startServer().catch(console.error);
