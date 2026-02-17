import { pipeline } from '@xenova/transformers';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

class EmbeddingService {
    private static instance: any = null;

    static async getInstance() {
        if (!this.instance) {
            this.instance = await pipeline('feature-extraction',
                'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
        }
        return this.instance;
    }

    static async generateEmbedding(text: string): Promise<number[]> {
        const extractor = await this.getInstance();

        // generate vector
        const output = await extractor(text, { pooling: 'mean', normalize: true });

        return Array.from(output.data);
    }

    /**Generates embeddings using the local Ollama instance with the Gemma model.*/
    static async generateGemmaEmbedding(text: string): Promise<number[]> {
        const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "embedding-gemma",
                prompt: text
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json() as { embedding: number[] };
        return data.embedding;
    }
}

export default EmbeddingService;