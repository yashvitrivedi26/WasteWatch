"""Text prompts that describe each trash level. The CLIP model compares a photo with these sentences."""
CLASSES = {
    "clean": [
        "a photo of a clean street with no garbage",
        "a photo of a clean road and footpath",
        "a photo of a tidy public place without litter",
        "a photo of an empty clean open ground",
    ],
    "low": [
        "a photo of a few pieces of litter on the street",
        "a photo of one small garbage bag on the roadside",
        "a photo of some scattered plastic wrappers on the ground",
        "a photo of a little trash near a wall",
    ],
    "medium": [
        "a photo of a pile of garbage on the street",
        "a photo of several garbage bags dumped on the roadside",
        "a photo of a heap of mixed waste and plastic",
        "a photo of an overflowing garbage bin",
    ],
    "high": [
        "a photo of a huge garbage dump covering the ground",
        "a photo of a large open dumping site full of trash",
        "a photo of a street completely covered with rubbish",
        "a photo of a massive mountain of waste",
    ],
    "other": [
        "a selfie of a person",
        "a screenshot of a phone screen",
        "a photo of a document or paper with text",
        "a photo of a room indoors",
    ],
}
LEVELS = ["clean", "low", "medium", "high"]
