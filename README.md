# PaperGraph

PaperGraph is a web-based, interactive tool designed to construct and manage interconnected knowledge graphs of academic papers. It features a multi-project workspace environment allowing users to isolate their research, automatically parsing uploaded PDF documents and establishing intuitive visual nodes and links between related research contexts.

## Development Highlights & Open Source Notes

The project aims to be simple and maintainable. Built using standard, lightweight web technologies:
- **Frontend:** React + Vite + TailwindCSS for a fast, responsive interface.
- **Graph Visualization:** D3.js for rendering force-directed graphs.
- **Backend API:** Node.js Express server to handle uploads and metadata.
- **Database Layer:** Standard Redis for high-performance and easy-to-use persistence of project nodes, links, and documents.

### Potential Areas for Future Optimization (for Contributors)
The codebase is currently very lean and well-structured, but as an open-source project, here are some areas where community contributions or future iterations might focus:
1. **PDF Parsing & Text Extraction:** Currently, PDFs are uploaded and stored, but full-text extraction/indexing (e.g., using `pdf.js` or Python-based extractors on the backend) could automatically generate summary tags or suggest links based on semantic similarity using a vector database (like Chroma or Pinecone).
2. **TypeScript Migration on Backend:** The frontend leverages TypeScript (`App.tsx`), but the backend (`server.js`) is vanilla JavaScript. Migrating the backend to TypeScript would improve type safety for API contracts.
3. **Authentication & Multi-user:** The current setup is designed for a single local user. Adding an auth layer (e.g., JWT, NextAuth/Auth.js) would make it viable as a hosted SaaS product.
4. **Graph Performance with Large Datasets:** For graphs exceeding thousands of nodes, D3's force simulation might lag. Implementing WebGL-based rendering (like `react-force-graph` or `vis.js`) or clustering algorithms could significantly optimize rendering on huge projects.

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+)
- Redis Server (Running on default port `6379`. Windows users can run via WSL `redis-server` or install Memurai)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/paperGraph.git
   cd paperGraph
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Create a `.env` file in the root directory based on `.env.example`.
   *(Requires your Gemini API key if using AI integrations)*

4. Start the application:
   ```bash
   # Starts both Vite frontend and Express backend concurrently
   npm run dev:all
   ```

5. Open your browser and navigate to the frontend URL (usually `http://localhost:3000`).

## 📁 File Structure

- `server.js` - Express backend, Redis connection, and API routes.
- `src/` - React frontend code, components, and hooks.
- `uploads/` - Local directory where uploaded PDF papers are stored.

## 📄 License
[MIT License](LICENSE)
