// Smooth Scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor=>{
    anchor.addEventListener('click', function(e){
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({behavior:'smooth'});
    });
});

// Image preview on file upload (request-quote.html)
const imgInput=document.querySelector('#job-images');
if(imgInput){
    imgInput.addEventListener('change', function(){
        const preview=document.querySelector('#image-preview');
        preview.innerHTML='';
        Array.from(this.files).forEach(file=>{
            const img=document.createElement('img');
            img.src=URL.createObjectURL(file);
            img.style.maxWidth='100px';
            img.style.margin='5px';
            preview.appendChild(img);
        });
    });
        }
