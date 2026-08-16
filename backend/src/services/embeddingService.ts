const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

class EmbeddingService {
    /**Generates embeddings using the local Ollama instance with the Gemma model.*/
    static async generateGemmaEmbedding(text: string): Promise<number[]> {
        const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "embeddinggemma",
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
