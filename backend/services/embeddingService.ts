import { pipeline } from '@xenova/transformers';

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
}

export default EmbeddingService;