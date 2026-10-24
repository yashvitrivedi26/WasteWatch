"""Text prompts that describe each trash level. The CLIP model compares a photo with these sentences.
If you edit them, the backend rebuilds the prompt embeddings automatically on the next start."""
CLASSES = {
    "clean": [
        "a photo of a clean street with no garbage",
        "a photo of a clean road and footpath",
        "a photo of a tidy public place without any litter",
        "a photo of a clean empty ground",
    ],
    "low": [
        "a photo of a single plastic bottle lying on the road",
        "a photo of a few scattered wrappers and papers on the ground",
        "a photo of one small garbage bag on the roadside",
        "a photo of a little bit of litter near a wall",
        "a photo of a dustbin with a small amount of trash beside it",
    ],
    "medium": [
        "a photo of a few garbage bags piled on the roadside",
        "a photo of a small heap of mixed trash on the street",
        "a photo of an overflowing dustbin with bags around it",
        "a photo of a pile of garbage next to a wall",
    ],
    "high": [
        "a photo of a huge pile of garbage on the street",
        "a photo of a large open garbage dump yard",
        "a photo of a street completely covered with rubbish",
        "a photo of a mountain of waste higher than a person",
        "a photo of garbage spread over a large open plot",
    ],
    "other": [
        "a selfie of a person",
        "a screenshot of a phone screen",
        "a photo of a document or paper with text",
        "a photo of a room indoors",
    ],
}
LEVELS = ["clean", "low", "medium", "high"]


def signature():
    import hashlib
    import json
    return hashlib.sha1(json.dumps(CLASSES, sort_keys=True).encode()).hexdigest()[:12]
