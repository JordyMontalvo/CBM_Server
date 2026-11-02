module github.com/JordyMontalvo/CBM_Server/closing-engine/cmd/server

go 1.22

require (
	github.com/JordyMontalvo/CBM_Server/closing-engine v0.0.0
	go.mongodb.org/mongo-driver v1.17.1
)

replace github.com/JordyMontalvo/CBM_Server/closing-engine => ../..
