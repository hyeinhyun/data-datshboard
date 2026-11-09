from hf_worker.mapping import normalize_image_tokens, suggest_mapping


def test_suggest_mapping_virl39k_columns():
    cols = ["question", "answer", "PassRate_32BTrained", "PassRate_7BBase", "category", "source", "qid", "image"]
    m = suggest_mapping(cols)
    assert m == {"question": "question", "answer": "answer", "image": "image", "id": "qid"}


def test_suggest_mapping_partial_names():
    m = suggest_mapping(["user_prompt", "model_response", "img_path"])
    assert m["question"] == "user_prompt"
    assert m["answer"] == "model_response"
    assert m["image"] == "img_path"


def test_normalize_replaces_variant_token():
    assert normalize_image_tokens("<image>\nWhat is this?") == "<|image|>\nWhat is this?"


def test_normalize_prepends_when_missing():
    assert normalize_image_tokens("What is this?", n_images=2) == "<|image|>\n<|image|>\nWhat is this?"


def test_normalize_leaves_text_only_alone():
    assert normalize_image_tokens("Hello", n_images=0) == "Hello"
