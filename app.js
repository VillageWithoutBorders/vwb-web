async function loadResources() {
    const res = await fetch('http://localhost:3000/resources');
    const data = await res.json();
    const table = document.getElementById('resourceTable');
    table.innerHTML = "";

    data.forEach(r => {
        let photo = "No photo";
        if (r.photo_url) {
            photo = "<img src='" + r.photo_url + "' class='resource-photo'>";
        }

        const row =
            "<tr>" +
                "<td>" + r.name + "</td>" +
                "<td>" + r.category + "</td>" +
                "<td>" + r.quantity + "</td>" +
                "<td>" + r.location + "</td>" +
                "<td>" + r.notes + "</td>" +
                "<td>" + photo + "</td>" +
                "<td><button onclick='deleteResource(" + r.id + ")'>Delete</button></td>" +
            "</tr>";

        table.innerHTML += row;
    });
}

document.getElementById('resourceForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const body = {
        name: document.getElementById('name').value,
        category: document.getElementById('category').value,
        quantity: document.getElementById('quantity').value,
        location: document.getElementById('location').value,
        notes: document.getElementById('notes').value
    };

    await fetch('http://localhost:3000/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    loadResources();
});

async function deleteResource(id) {
    await fetch("http://localhost:3000/resources/" + id, { method: "DELETE" });
    loadResources();
}

loadResources();
