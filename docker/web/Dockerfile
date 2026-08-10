FROM nginx:1.27-alpine

# Frontend static files only (from project root - excludes backend-python/ and docker/)
COPY *.html /usr/share/nginx/html/
COPY *.css /usr/share/nginx/html/
COPY *.js /usr/share/nginx/html/
COPY *.png /usr/share/nginx/html/

# Uncomment if you add these file types or keep images in a subfolder:
# COPY *.svg /usr/share/nginx/html/
# COPY images /usr/share/nginx/html/images
